export type VideoKind = "video" | "live";

export type Quality = "240p" | "360p" | "720p";

export type RankingMetric = "total" | "view" | "comment" | "like" | "mylist";

// ranking: genre ranking (default) / tag: popular videos for a tag (auto) / manual: user-picked videos
export type SourceMode = "ranking" | "tag" | "manual";

// One entry of the pool saved by scripts/fetch-ranking.ts.
export interface PoolItem {
  id: string;
  title: string;
  genre: string | null;
  tags: string[];
  viewCounter: number;
  commentCounter: number;
  likeCounter: number;
  mylistCounter: number;
  lengthSeconds: number;
  startTime: string;
  thumbnail?: string | null; // contentId of a downloaded thumbnail (THUMBNAIL_TAGS only)
}

// real: downloaded thumbnail as-is / mosaic: pixelated copy / off: mock video frame
export type ThumbnailStyle = "real" | "mosaic" | "off";

export interface VideoItem {
  id: string; // contentId (sm9 etc.) or mock id
  mockId: string; // mock01..mock10 by rank: key for local video / comments / summaries
  title: string;
  genre: string | null;
  kind: VideoKind;
  rank: number; // 1-10 in ranking/tag mode, add order in manual mode (also the quality priority)
  badge: string; // label on the tile ("1位", "3本目")
  lengthSeconds: number; // live: length of the broadcast slot
  viewCounter: number;
  commentCounter: number;
  likeCounter?: number;
  thumbnail: string; // frame of the mock video
  realThumbnail: string | null; // downloaded thumbnail id, shown according to ThumbnailStyle
  clipSeconds: number; // length of the mock video actually played
  credit: VideoCredit | null;
  sources: Record<Quality, string>;
}

// Attribution for the CC BY footage behind each mock id (public/data/videos.json).
export interface VideoCredit {
  title: string;
  year: number;
  author: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  changes: string;
}

export interface MockVideo {
  mockId: string;
  clipSeconds: number;
  credit: VideoCredit;
}

export interface CommentEvent {
  t: number; // seconds in the video (live: seconds since the broadcast started)
  text: string;
}

export interface Summary {
  videoId: string; // mock id
  from: number;
  to: number;
  oneLine: string;
  recap: string;
}

export interface SummaryData {
  peaks: Summary[];
  liveRecaps: Record<string, string[]>; // mock id -> rotating "while you were away" texts
}

export interface Peak {
  t: number; // center of the peak (seconds)
  score: number; // ratio against the normal pace
}

export type EndAction = "remove" | "next";

export interface GridLayout {
  cols: number;
  rows: number;
}
