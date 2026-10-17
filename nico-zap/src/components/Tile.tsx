import { useEffect, useMemo, useRef, useState } from "react";
import { config } from "../config";
import { glowingPeak, highlightSegments, nextPlayablePosition, recentCount } from "../engine/excitement";
import { liveTime } from "../engine/liveClock";
import { timelineLength } from "../data/load";
import { formatCount, formatDuration, formatTime, thumbnailSrc } from "../format";
import type { CommentEvent, Peak, Quality, ThumbnailStyle, VideoItem } from "../types";
import type { LiveCatchUp } from "./CatchUpPanel";

export interface TileProps {
  slot: number;
  item: VideoItem;
  initial: boolean; // first item of the slot since the demo started (gets a staggered start)
  started: boolean;
  paused: boolean;
  rate: number;
  quality: Quality;
  highlight: boolean;
  comments: CommentEvent[];
  peaks: Peak[];
  resume: { t: number; nonce: number } | undefined;
  catchUp: LiveCatchUp | undefined;
  showDebug: boolean;
  thumbnailStyle: ThumbnailStyle;
  onZoom: (slot: number, videoTime: number) => void;
  onEnded: (slot: number) => void;
  onRemove?: (slot: number) => void; // manual mode only
}

const MOMENTUM_MAX = 20; // comments per second shown as a full bar

function initialPosition(item: VideoItem, slot: number, initial: boolean, highlight: boolean, peaks: Peak[]) {
  if (item.kind === "live") return 0;
  const length = timelineLength(item);
  const segments = highlightSegments(peaks, length);
  if (highlight && segments.length > 0) {
    const [start, end] = segments[0];
    return initial ? Math.min(start + slot * config.staggerSeconds.highlight, end - 5) : start;
  }
  return initial ? Math.min(slot * config.staggerSeconds.normal, length - 30) : 0;
}

export function Tile(props: TileProps) {
  const { slot, item, started, paused, rate, quality, highlight, comments, peaks, onEnded } = props;
  const isLive = item.kind === "live";
  const videoRef = useRef<HTMLVideoElement>(null);
  const posRef = useRef(initialPosition(item, slot, props.initial, highlight, peaks));
  const endedRef = useRef(false);
  const [t, setT] = useState(() => (isLive ? liveTime(item.mockId) : posRef.current));

  const length = timelineLength(item);
  const segments = useMemo(() => highlightSegments(peaks, length), [peaks, length]);
  const effectiveRate = isLive ? 1 : rate;
  const shouldPlay = started && !paused;

  const finish = () => {
    if (endedRef.current) return;
    endedRef.current = true;
    onEnded(slot);
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = effectiveRate;
  }, [effectiveRate]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (shouldPlay) v.play().catch(() => {});
    else v.pause();
  }, [shouldPlay]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !props.resume) return;
    posRef.current = props.resume.t;
    v.currentTime = props.resume.t;
  }, [props.resume]);

  useEffect(() => {
    if (!started) return;
    const id = window.setInterval(() => {
      const v = videoRef.current;
      if (!v) return;
      if (isLive) {
        setT(liveTime(item.mockId));
        return;
      }
      if (v.readyState < 1) return;
      const cur = v.currentTime;
      posRef.current = cur;
      if (highlight && !paused) {
        const next = nextPlayablePosition(segments, cur);
        if (next === null) {
          finish();
          return;
        }
        if (next - cur > 0.5) {
          v.currentTime = next;
          posRef.current = next;
        }
      }
      setT(posRef.current);
    }, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, paused, highlight, segments, isLive, item.mockId]);

  // Re-applied after every src change (quality switch resets position and rate).
  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    if (isLive) {
      v.currentTime = (liveTime(item.mockId) + slot * 7) % Math.max(1, v.duration);
    } else {
      v.currentTime = posRef.current;
    }
    v.defaultPlaybackRate = effectiveRate;
    v.playbackRate = effectiveRate;
    if (shouldPlay) v.play().catch(() => {});
  };

  const thumb = thumbnailSrc(item, props.thumbnailStyle);
  const hasRealThumb = !!item.realThumbnail && props.thumbnailStyle !== "off";
  const glow = started ? glowingPeak(peaks, t) : null;
  const perSecond = recentCount(comments, t, config.excitement.movingAverageSeconds) / config.excitement.movingAverageSeconds;

  return (
    <div
      className={`tile${glow ? " glow" : ""}${isLive ? " live" : ""}`}
      onClick={() => started && props.onZoom(slot, posRef.current)}
    >
      <div className="tile-video">
        <video
          ref={videoRef}
          src={item.sources[quality]}
          poster={thumb}
          muted
          playsInline
          preload="auto"
          loop={isLive}
          onLoadedMetadata={onLoadedMetadata}
          onEnded={() => !isLive && started && finish()}
        />
        <div className="tile-badges">
          <span className="rank">{item.badge}</span>
          {isLive && <span className="live-badge">LIVE</span>}
          {!isLive && effectiveRate !== 1 && <span className="rate-badge">×{effectiveRate}</span>}
          {props.showDebug && <span className="quality-badge">{quality}</span>}
          {props.onRemove && (
            <button
              className="remove-button"
              title="この枠から外す"
              onClick={(e) => {
                e.stopPropagation();
                props.onRemove?.(slot);
              }}
            >
              ×
            </button>
          )}
        </div>
        {glow && <div className="glow-label">盛り上がり中！</div>}
        {!started && (
          <div className="tile-poster">
            <img className="tile-poster-bg" src={thumb} alt="" />
            <img className="tile-poster-img" src={thumb} alt="" />
          </div>
        )}
        {started && hasRealThumb && <img className="tile-thumb" src={thumb} alt="" />}
        {props.catchUp && (
          <div className="tile-catchup">
            <div className="tile-catchup-head">見ていない間：{formatDuration(props.catchUp.to - props.catchUp.from)}</div>
            <div className="tile-catchup-body">{props.catchUp.recap}</div>
            {props.catchUp.peaks.length > 0 && (
              <div className="tile-catchup-peaks">山：{props.catchUp.peaks.map((p) => formatTime(p.t)).join(" / ")}</div>
            )}
          </div>
        )}
        <div className="tile-footer">
        <div className="tile-title" title={item.title}>
          {item.title}
        </div>
        <div className="tile-meta">
          <span>再生 {formatCount(item.viewCounter)}</span>
          <span>コメ {formatCount(item.commentCounter)}</span>
          <span className="tile-time">
            {isLive ? `放送 ${formatTime(t)}` : `${formatTime(t)} / ${formatTime(length)}`}
          </span>
          <span className="momentum" title={`勢い ${perSecond.toFixed(1)}件/秒`}>
            <span style={{ width: `${Math.min(100, (perSecond / MOMENTUM_MAX) * 100)}%` }} />
          </span>
        </div>
        </div>
      </div>
    </div>
  );
}

export function EmptyTile({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <div className={`tile empty${onClick ? " addable" : ""}`} onClick={onClick}>
      <div className="tile-video">
        <div className="empty-label">{label}</div>
      </div>
    </div>
  );
}
