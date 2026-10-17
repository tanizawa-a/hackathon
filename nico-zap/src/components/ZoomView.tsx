import { useEffect, useRef, useState } from "react";
import { config } from "../config";
import { glowingPeak } from "../engine/excitement";
import { liveTime } from "../engine/liveClock";
import { timelineLength } from "../data/load";
import { formatCount, formatTime, thumbnailSrc } from "../format";
import type { CommentEvent, Peak, Summary, ThumbnailStyle, VideoItem } from "../types";
import { CatchUpPanel, type LiveCatchUp } from "./CatchUpPanel";
import { CommentStrip } from "./CommentStrip";
import { CreditLine } from "./Credits";

interface Props {
  item: VideoItem;
  fromTime: number; // tile position when zoomed
  comments: CommentEvent[];
  peaks: Peak[];
  summaries: Summary[];
  live: LiveCatchUp | null;
  thumbnailStyle: ThumbnailStyle;
  onClose: (videoTime: number) => void;
}

export function ZoomView({ item, fromTime, comments, peaks, summaries, live, thumbnailStyle, onClose }: Props) {
  const isLive = item.kind === "live";
  const videoRef = useRef<HTMLVideoElement>(null);
  const startAt = isLive ? fromTime : Math.max(0, fromTime - config.zoom.rewindSeconds);
  const [t, setT] = useState(isLive ? liveTime(item.mockId) : startAt);

  const close = () => onClose(videoRef.current?.currentTime ?? startAt);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const id = window.setInterval(() => {
      const v = videoRef.current;
      if (isLive) setT(liveTime(item.mockId));
      else if (v) setT(v.currentTime);
    }, 250);
    return () => window.clearInterval(id);
  }, [isLive, item.mockId]);

  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = isLive ? liveTime(item.mockId) % Math.max(1, v.duration) : startAt;
    v.playbackRate = 1;
    v.volume = 0.6;
    v.play().catch(() => {
      // Autoplay with sound refused: fall back to muted.
      v.muted = true;
      v.play().catch(() => {});
    });
  };

  const glow = glowingPeak(peaks, t);
  const length = timelineLength(item);

  return (
    <div className="zoom-backdrop" onClick={close}>
      <div className="zoom" onClick={(e) => e.stopPropagation()}>
        <div className="zoom-header">
          {item.realThumbnail && thumbnailStyle !== "off" && (
            <img className="zoom-thumb" src={thumbnailSrc(item, thumbnailStyle)} alt="" />
          )}
          <span className="rank">{item.badge}</span>
          {isLive && <span className="live-badge">LIVE</span>}
          <span className="zoom-title">{item.title}</span>
          <span className="muted zoom-stats">
            再生 {formatCount(item.viewCounter)} ・ コメ {formatCount(item.commentCounter)}
          </span>
          <button className="close-button" onClick={close}>
            グリッドに戻る（Esc）
          </button>
        </div>
        <div className="zoom-body">
          <div className={`zoom-video${glow ? " glow" : ""}`}>
            <video
              ref={videoRef}
              src={item.sources[config.quality.main]}
              playsInline
              preload="auto"
              loop={isLive}
              onLoadedMetadata={onLoadedMetadata}
              onEnded={close}
            />
            <div className="zoom-time">
              {isLive ? `放送 ${formatTime(t)}` : `${formatTime(t)} / ${formatTime(length)}`} ・ 720p ・ 1倍速 ・ 音あり
            </div>
          </div>
          <aside className="zoom-side">
            <CatchUpPanel
              item={item}
              t={t}
              rewoundFrom={isLive ? null : fromTime}
              summaries={summaries}
              live={live}
            />
            <CommentStrip comments={comments} t={t} />
            <CreditLine credit={item.credit} />
          </aside>
        </div>
      </div>
    </div>
  );
}
