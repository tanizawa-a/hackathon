import { useEffect, useMemo, useRef, useState } from "react";
import { METRICS, config } from "./config";
import { buildManualItem, buildRanking, buildTagRanking, loadDemoData, type DemoData } from "./data/load";
import { allocateQuality } from "./engine/qualityBudget";
import { addItem, contains, finishSlot, initGrid, removeSlot, resizeGrid, type GridState } from "./engine/queue";
import { liveTime, markFocused, nextRecap, peaksIn, startLiveClock, unseenRange } from "./engine/liveClock";
import { AddVideoPanel } from "./components/AddVideoPanel";
import { ControlBar, DebugPanel } from "./components/ControlBar";
import { CreditsDialog } from "./components/Credits";
import { SourceBar } from "./components/SourceBar";
import { Grid } from "./components/Grid";
import { EmptyTile, Tile } from "./components/Tile";
import { ZoomView } from "./components/ZoomView";
import type { LiveCatchUp } from "./components/CatchUpPanel";
import type { EndAction, GridLayout, PoolItem, RankingMetric, SourceMode, ThumbnailStyle } from "./types";

interface ZoomState {
  slot: number;
  fromTime: number;
  live: LiveCatchUp | null;
  pausedLive: Record<string, number>; // mockId -> live time when the grid was paused
}

interface SourceState {
  mode: SourceMode;
  metric: RankingMetric;
  categories: string[];
  tag: string;
}

function emptyGrid(size: number): GridState {
  return initGrid([], size);
}

function gridFor(data: DemoData, s: SourceState, size: number): GridState {
  switch (s.mode) {
    case "ranking":
      return initGrid(buildRanking(data, s.metric, s.categories), size);
    case "tag":
      return initGrid(buildTagRanking(data, s.tag, s.metric), size);
    case "manual":
      return emptyGrid(size);
  }
}

export default function App() {
  const [data, setData] = useState<DemoData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grid, setGrid] = useState<GridState | null>(null);
  const [source, setSource] = useState<SourceState>({
    mode: config.defaultMode,
    metric: config.defaultMetric,
    categories: config.defaultCategories,
    tag: config.defaultTag,
  });
  const [layout, setLayout] = useState<GridLayout>(config.defaultGridLayout);
  const gridSize = layout.cols * layout.rows;
  // The manual grid is kept while other modes are shown, so switching back restores it.
  const manualGridRef = useRef<GridState>(emptyGrid(gridSize));
  const manualCountRef = useRef(0);
  // Bumped when the grid is rebuilt so that every tile remounts.
  const [epoch, setEpoch] = useState(0);
  const [started, setStarted] = useState(false);
  const [rate, setRate] = useState(config.defaultRate);
  const [premium, setPremium] = useState(config.defaultPremium);
  const [highlight, setHighlight] = useState(config.highlight.enabledByDefault);
  const [endAction, setEndAction] = useState<EndAction>("next");
  const [showDebug, setShowDebug] = useState(false);
  const [thumbnailStyle, setThumbnailStyle] = useState<ThumbnailStyle>(config.defaultThumbnailStyle);
  const [showCredits, setShowCredits] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  const [resume, setResume] = useState<Record<number, { t: number; nonce: number }>>({});
  const [tileCatchUps, setTileCatchUps] = useState<Record<number, LiveCatchUp>>({});
  const endActionRef = useRef(endAction);
  endActionRef.current = endAction;

  useEffect(() => {
    loadDemoData()
      .then((d) => {
        setData(d);
        setGrid(gridFor(d, source, gridSize));
      })
      .catch((e: unknown) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (source.mode === "manual" && grid) manualGridRef.current = grid;
  }, [source.mode, grid]);

  // Background tiles are budgeted as if playing; while zoomed they are paused anyway.
  const budget = useMemo(() => {
    const tiles = grid
      ? grid.slots.flatMap((item, slot) =>
          item ? [{ slot, rank: item.rank, rate: item.kind === "live" ? 1 : rate }] : [],
        )
      : [];
    return allocateQuality(tiles, undefined, !!zoom);
  }, [grid, rate, zoom]);

  if (error) return <div className="message">データの読み込みに失敗しました：{error}</div>;
  if (!data || !grid) return <div className="message">読み込み中…</div>;

  const resetTiles = () => {
    setResume({});
    setTileCatchUps({});
    setZoom(null);
    setEpoch((e) => e + 1);
  };

  const applySource = (next: SourceState) => {
    setSource(next);
    setGrid(next.mode === "manual" ? manualGridRef.current : gridFor(data, next, gridSize));
    resetTiles();
  };

  const addManual = (picked: PoolItem | string) => {
    const id = typeof picked === "string" ? picked : picked.id;
    if (contains(grid, id)) return;
    const item = buildManualItem(data, picked, manualCountRef.current++);
    setGrid((g) => (g ? addItem(g, item) : g));
  };

  const removeTile = (slot: number) => {
    setGrid((g) => (g ? removeSlot(g, slot) : g));
    setResume((r) => {
      const { [slot]: _, ...rest } = r;
      return rest;
    });
  };

  const clearManual = () => {
    manualCountRef.current = 0;
    setGrid(emptyGrid(gridSize));
    resetTiles();
  };

  // Ranking and tag grids are rebuilt in rank order; the manual grid keeps its videos.
  const changeLayout = (next: GridLayout) => {
    const size = next.cols * next.rows;
    if (next.cols === layout.cols && next.rows === layout.rows) return;
    setLayout(next);
    manualGridRef.current = resizeGrid(source.mode === "manual" ? grid : manualGridRef.current, size);
    setGrid(source.mode === "manual" ? manualGridRef.current : gridFor(data, source, size));
    resetTiles();
  };

  const start = () => {
    startLiveClock();
    setStarted(true);
  };

  const onEnded = (slot: number) => {
    setGrid((g) => (g ? finishSlot(g, slot, endActionRef.current) : g));
    setResume((r) => {
      const { [slot]: _, ...rest } = r;
      return rest;
    });
  };

  const onZoom = (slot: number, fromTime: number) => {
    const item = grid.slots[slot];
    if (!item) return;
    let live: LiveCatchUp | null = null;
    if (item.kind === "live") {
      const range = unseenRange(item.mockId);
      live = {
        ...range,
        recap: nextRecap(item.mockId, data.summaries.liveRecaps),
        peaks: peaksIn(data.peaks[item.mockId], range),
      };
      markFocused(item.mockId);
      fromTime = liveTime(item.mockId);
    }
    const pausedLive: Record<string, number> = {};
    grid.slots.forEach((s, i) => {
      if (s && s.kind === "live" && i !== slot) pausedLive[s.mockId] = liveTime(s.mockId);
    });
    setTileCatchUps({});
    setZoom({ slot, fromTime, live, pausedLive });
  };

  const onCloseZoom = (videoTime: number) => {
    if (!zoom) return;
    const item = grid.slots[zoom.slot];
    if (item?.kind === "video") {
      setResume((r) => ({ ...r, [zoom.slot]: { t: videoTime, nonce: Date.now() } }));
    }
    if (item?.kind === "live") markFocused(item.mockId);
    // Live tiles kept running while the grid was paused: show what was missed.
    const catchUps: Record<number, LiveCatchUp> = {};
    grid.slots.forEach((s, i) => {
      if (!s || s.kind !== "live" || zoom.pausedLive[s.mockId] === undefined) return;
      const range = { from: zoom.pausedLive[s.mockId], to: liveTime(s.mockId) };
      if (range.to - range.from < 3) return;
      catchUps[i] = {
        ...range,
        recap: nextRecap(s.mockId, data.summaries.liveRecaps),
        peaks: peaksIn(data.peaks[s.mockId], range),
      };
      markFocused(s.mockId);
    });
    setTileCatchUps(catchUps);
    if (Object.keys(catchUps).length > 0) {
      window.setTimeout(() => setTileCatchUps({}), config.catchUpAutoHideMs);
    }
    setZoom(null);
  };

  const zoomItem = zoom ? grid.slots[zoom.slot] : null;
  const metricLabel = METRICS.find((m) => m.key === source.metric)?.label ?? source.metric;
  const fetched = new Date(data.ranking.fetchedAt).toLocaleString("ja-JP");
  const approx = source.metric === "total" ? "・総合は独自の近似値" : "";
  const isMock = data.ranking.source !== "snapshot";
  let sourceLabel: string;
  if (source.mode === "ranking") {
    const scope = source.categories.length === 0 ? "全ジャンル" : source.categories.join("・");
    sourceLabel = isMock
      ? `${metricLabel} / ${scope}（モックデータ）`
      : `${metricLabel} / ${scope}（直近7日・スナップショット検索API v2 ${fetched}取得${approx}）`;
  } else if (source.mode === "tag") {
    const known = data.ranking.tagPools?.[source.tag] !== undefined;
    sourceLabel = isMock
      ? `タグ「${source.tag}」の${metricLabel}上位（モックデータ）`
      : `タグ「${source.tag}」の${metricLabel}上位（${known ? "直近30日・事前取得" : "取得済みの一覧から抽出"}${approx}）`;
  } else {
    const count = grid.slots.filter(Boolean).length + grid.queue.length;
    sourceLabel = `マニュアル：${count}本（${gridSize}本を超えた分は待機に並びます）`;
  }
  const emptyLabel =
    source.mode === "manual" ? "＋ 動画を追加" : source.mode === "tag" ? "該当する動画がありません" : "空き枠";
  const addedIds = new Set([...grid.slots, ...grid.queue].flatMap((s) => (s ? [s.id] : [])));

  return (
    <div className="app">
      <header className="top-bar">
        <ControlBar
          started={started}
          onStart={start}
          rate={rate}
          onRate={setRate}
          premium={premium}
          onPremium={setPremium}
          highlight={highlight}
          onHighlight={setHighlight}
          endAction={endAction}
          onEndAction={setEndAction}
          showDebug={showDebug}
          onDebug={setShowDebug}
          thumbnailStyle={thumbnailStyle}
          onThumbnailStyle={setThumbnailStyle}
          layout={layout}
          onLayout={changeLayout}
          onCredits={() => setShowCredits(true)}
        />
        <SourceBar
          mode={source.mode}
          onMode={(mode) => applySource({ ...source, mode })}
          metric={source.metric}
          onMetric={(metric) => applySource({ ...source, metric })}
          categories={source.categories}
          onCategories={(categories) => applySource({ ...source, categories })}
          tag={source.tag}
          onTag={(tag) => applySource({ ...source, tag })}
          onOpenAdd={() => setShowAdd(true)}
          onClear={clearManual}
          sourceLabel={sourceLabel}
        />
      </header>
      <main className="stage">
        <Grid layout={layout}>
          {grid.slots.map((item, slot) =>
            item ? (
              <Tile
                key={`${epoch}-${slot}-${grid.generations[slot]}`}
                slot={slot}
                item={item}
                initial={grid.generations[slot] === 0}
                started={started}
                paused={!!zoom}
                rate={rate}
                quality={budget.qualities[slot] ?? config.quality.background}
                highlight={highlight}
                comments={data.comments[item.mockId]}
                peaks={data.peaks[item.mockId]}
                resume={resume[slot]}
                catchUp={tileCatchUps[slot]}
                showDebug={showDebug}
                thumbnailStyle={thumbnailStyle}
                onZoom={onZoom}
                onEnded={onEnded}
                onRemove={source.mode === "manual" ? removeTile : undefined}
              />
            ) : (
              <EmptyTile
                key={`${epoch}-${slot}-empty`}
                label={emptyLabel}
                onClick={source.mode === "manual" ? () => setShowAdd(true) : undefined}
              />
            ),
          )}
        </Grid>
        {showDebug && (
          <DebugPanel budget={budget} rate={rate} tiles={grid.slots.filter(Boolean).length} />
        )}
      </main>
      {zoom && zoomItem && (
        <ZoomView
          item={zoomItem}
          fromTime={zoom.fromTime}
          comments={data.comments[zoomItem.mockId]}
          peaks={data.peaks[zoomItem.mockId]}
          summaries={data.summaries.peaks}
          live={zoom.live}
          thumbnailStyle={thumbnailStyle}
          onClose={onCloseZoom}
        />
      )}
      {showAdd && (
        <AddVideoPanel
          items={data.items}
          blocked={data.blocked}
          addedIds={addedIds}
          onAdd={addManual}
          onClose={() => setShowAdd(false)}
        />
      )}
      {showCredits && <CreditsDialog videos={Object.values(data.mockVideos)} onClose={() => setShowCredits(false)} />}
    </div>
  );
}
