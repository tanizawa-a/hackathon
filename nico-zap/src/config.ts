import type { GridLayout, Quality, RankingMetric, SourceMode, ThumbnailStyle } from "./types";

export const METRICS: { key: RankingMetric; label: string }[] = [
  { key: "total", label: "総合" },
  { key: "view", label: "再生数" },
  { key: "comment", label: "コメント数" },
  { key: "like", label: "いいね数" },
  { key: "mylist", label: "マイリスト数" },
];

// Genre names used by Snapshot Search API v2. Keep in sync with scripts/fetch-ranking.ts.
export const CATEGORIES = [
  "アニメ",
  "ゲーム",
  "音楽・サウンド",
  "エンターテイメント",
  "ダンス",
  "料理",
  "解説・講座",
  "旅行・アウトドア",
  "技術・工作",
];

// Tags whose popular videos are pre-fetched. Keep in sync with TAGS in scripts/fetch-ranking.ts.
export const PRESET_TAGS = [
  "VOICEROIDキッチン",
  "VOCALOID",
  "歌ってみた",
  "踊ってみた",
  "演奏してみた",
  "ゲーム実況",
  "RTA",
  "料理",
  "描いてみた",
  "旅行",
  "鉄道",
  "初音ミク",
  "MMD",
];

export const config = {
  // The demo opens on the VOICEROIDキッチン tag, the only one with real thumbnails.
  // Set defaultMode to "ranking" to open on the genre ranking instead.
  defaultMode: "tag" as SourceMode,
  defaultTag: "VOICEROIDキッチン",
  defaultThumbnailStyle: "real" as ThumbnailStyle,
  searchResultLimit: 20,
  defaultMetric: "total" as RankingMetric,
  defaultCategories: [] as string[], // empty = all genres

  // "snapshot": public/data/ranking.json (fetched from Snapshot Search API v2)
  // "mock": public/data/ranking.mock.json (fictional titles)
  // When "snapshot" fails to load, the app falls back to "mock".
  dataSource: "snapshot" as "snapshot" | "mock",

  // Grid layouts selectable from the top bar. Tiles are always 16:9.
  gridLayouts: [
    { cols: 2, rows: 2 },
    { cols: 3, rows: 2 },
    { cols: 3, rows: 3 },
  ] as GridLayout[],
  defaultGridLayout: { cols: 3, rows: 3 } as GridLayout,
  rankingSize: 10,

  // Mock ids played as live broadcasts. Shared with scripts/generate-comments.ts.
  liveMockIds: ["mock04", "mock08"],
  liveLengthSeconds: 1800,
  // Position of the pseudo live clock when the demo starts (broadcast already running).
  // Chosen so that a peak arrives within about a minute of starting the demo.
  liveStartSeconds: { mock04: 530, mock08: 960 } as Record<string, number>,

  mockVideoSeconds: 180,

  // Steps of the speed slider (same range as the niconico player).
  playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
  defaultRate: 1,
  // On niconico, 1.5x and faster is for premium members. The demo toggles membership as a mock.
  premiumMinRate: 1.5,
  defaultPremium: true,

  highlight: {
    enabledByDefault: true,
    leadSeconds: 15, // start this many seconds before the peak center
    segmentSeconds: 30, // play this many seconds per peak
  },

  // Stagger tiles so they do not all swap at once.
  staggerSeconds: {
    normal: 12, // start offset per slot in normal playback
    highlight: 4, // offset into the first segment per slot in highlight playback
  },

  excitement: {
    movingAverageSeconds: 5,
    thresholdRatio: 3, // moving average / median
    mergeWithinSeconds: 20,
    minRatePerSecond: 4, // ignore noise in very quiet videos
    // Glow window around a detected peak center.
    glowLeadSeconds: 4,
    glowTailSeconds: 8,
  },

  zoom: {
    rewindSeconds: 10,
    recentComments: 10,
    commentWindowSeconds: 15,
  },

  quality: {
    // Budget in megapixels per second (pixels x fps x rate, summed over background tiles).
    // Only 240p files exist, so quality is simulated: tiles report a nominal quality.
    budgetMpxPerSec: 90,
    fps: 30,
    background: "360p" as Quality,
    main: "720p" as Quality,
  },

  catchUpAutoHideMs: 8000,
};

export const QUALITY_PIXELS: Record<Quality, number> = {
  "240p": 426 * 240,
  "360p": 640 * 360,
  "720p": 1280 * 720,
};

export const QUALITY_ORDER: Quality[] = ["240p", "360p", "720p"];
