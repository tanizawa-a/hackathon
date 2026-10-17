import { config } from "../config";
import { summaryAt } from "../engine/summary";
import { formatDuration, formatTime } from "../format";
import type { Peak, Summary, VideoItem } from "../types";

export interface LiveCatchUp {
  from: number;
  to: number;
  recap: string;
  peaks: Peak[];
}

interface Props {
  item: VideoItem;
  t: number;
  rewoundFrom: number | null;
  summaries: Summary[];
  live: LiveCatchUp | null;
}

export function CatchUpPanel({ item, t, rewoundFrom, summaries, live }: Props) {
  if (item.kind === "live") {
    return (
      <div className="catchup">
        <div className="panel-title">見ていない間の要約</div>
        {live && live.to - live.from >= 1 ? (
          <>
            <div className="catchup-duration">
              見ていない間：{formatDuration(live.to - live.from)}
              <span className="muted">
                （{formatTime(live.from)} 〜 {formatTime(live.to)}）
              </span>
            </div>
            <p className="catchup-text">{live.recap}</p>
            <div className="catchup-peaks">
              <span className="muted">その間の山：</span>
              {live.peaks.length === 0 ? (
                <span className="muted">なし</span>
              ) : (
                live.peaks.map((p) => (
                  <span key={p.t} className="peak-chip">
                    {formatTime(p.t)}
                  </span>
                ))
              )}
            </div>
          </>
        ) : (
          <p className="muted">見逃した区間はありません。</p>
        )}
      </div>
    );
  }

  const summary = summaryAt(summaries, item.mockId, t);
  return (
    <div className="catchup">
      <div className="panel-title">キャッチアップ</div>
      {rewoundFrom !== null && (
        <div className="rewind-chip">
          ⟲ {config.zoom.rewindSeconds}秒戻して再生（{formatTime(rewoundFrom)} → {formatTime(Math.max(0, rewoundFrom - config.zoom.rewindSeconds))}）
        </div>
      )}
      <div className="catchup-oneline">
        <span className="muted">直前の盛り上がり：</span>
        {summary ? <strong>{summary.oneLine}</strong> : <span className="muted">まだありません</span>}
      </div>
    </div>
  );
}
