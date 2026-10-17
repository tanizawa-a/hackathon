// Generate deterministic mock comment timelines and fixed summaries.
// Output: public/data/comments/mockNN.json, public/data/summaries.json
// Usage: node scripts/generate-comments.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface CommentEvent {
  t: number;
  text: string;
}

interface Summary {
  videoId: string;
  from: number;
  to: number;
  oneLine: string;
  recap: string;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public/data");
const SEED = 20261017;
const VIDEO_SECONDS = 180;

// Clip lengths written by scripts/fetch-videos.ts (falls back to VIDEO_SECONDS).
const VIDEOS_JSON = join(OUT_DIR, "videos.json");
const clipSeconds: Record<string, number> = existsSync(VIDEOS_JSON)
  ? Object.fromEntries(
      (JSON.parse(readFileSync(VIDEOS_JSON, "utf8")) as { mockId: string; clipSeconds: number }[]).map((v) => [
        v.mockId,
        v.clipSeconds,
      ]),
    )
  : {};
const LIVE_SECONDS = 1800;
const LIVE_IDS = ["mock04", "mock08"];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
const between = (min: number, max: number) => min + rand() * (max - min);
const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];

// Poisson sample (Knuth); fine for small lambda.
function poisson(lambda: number): number {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > l);
  return k - 1;
}

const NORMAL_TEXTS = [
  "わこつ", "こんばんは", "初見です", "なるほど", "かわいい", "いいね", "これ好き",
  "BGMいい", "画質きれい", "ほう", "うまい", "ここ好き", "おつ", "草", "なつかしい",
  "わかる", "それな", "へー", "神", "つよい",
];
const PEAK_TEXTS = [
  "きたああああ", "ここすき", "草", "wwwww", "8888888", "神回", "うおおおお",
  "鳥肌", "えぇ…", "やばい", "最高", "！？", "ここ好きすぎる", "かっこいい",
  "泣いた", "天才か", "伝説の瞬間", "うまああ", "ｷﾀ━━━━(ﾟ∀ﾟ)━━━━!!",
];

// Neutral wording: the mock footage is assigned to arbitrary real titles,
// so the lines must not describe specific content.
const PEAK_LINES = [
  "コメントが一気に増えた場面",
  "「ここすき」が集中した場面",
  "笑いのコメントが続いた場面",
  "「8888」が流れた場面",
  "驚きのコメントが重なった場面",
  "今回いちばんの盛り上がり",
  "感想コメントが急増した場面",
  "「きたー」が連続した場面",
];

const LIVE_RECAPS: Record<string, string[]> = {
  mock04: [
    "雑談パートから企画コーナーへ移り、視聴者アンケートの結果発表で盛り上がりました。",
    "リスナー参加型のクイズが始まり、難問の正解者が出たところでコメントが急増しました。",
    "ゲストが合流して近況トークに。次回の企画告知があり、歓声が上がりました。",
  ],
  mock08: [
    "ゲーム実況はボス戦に突入。2回の全滅を経て、3回目で撃破しました。",
    "新エリアに到達し、隠しアイテムを発見。視聴者のアドバイスが的中しました。",
    "耐久企画の目標まで残りわずか。ラストスパートで応援コメントが殺到しています。",
  ],
};

function makeTimeline(length: number, peakCenters: number[]): CommentEvent[] {
  const events: CommentEvent[] = [];
  const baseRate = between(0.5, 2);
  const peaks = peakCenters.map((c) => ({
    center: c,
    width: between(10, 20),
    rate: between(10, 20),
  }));
  for (let s = 0; s < length; s++) {
    let rate = baseRate;
    let inPeak = false;
    for (const p of peaks) {
      const d = Math.abs(s - p.center);
      if (d <= p.width / 2) {
        // Triangular ramp toward the center.
        rate = Math.max(rate, baseRate + p.rate * (1 - (d / (p.width / 2)) * 0.6));
        inPeak = true;
      }
    }
    const n = poisson(rate);
    for (let i = 0; i < n; i++) {
      events.push({
        t: Math.round((s + rand()) * 100) / 100,
        text: inPeak && rand() < 0.8 ? pick(PEAK_TEXTS) : pick(NORMAL_TEXTS),
      });
    }
  }
  return events.sort((a, b) => a.t - b.t);
}

// Stratified placement: one peak per equal slot, jittered inside the slot,
// so peaks never merge and are spread over the whole timeline.
function placePeaks(length: number, count: number, margin: number): number[] {
  const slot = (length - margin * 2) / count;
  return Array.from({ length: count }, (_, i) =>
    Math.round(margin + slot * i + slot * between(0.25, 0.75)),
  );
}

mkdirSync(join(OUT_DIR, "comments"), { recursive: true });

const summaries: Summary[] = [];
let lineIndex = 0;
for (let n = 1; n <= 10; n++) {
  const id = `mock${String(n).padStart(2, "0")}`;
  const isLive = LIVE_IDS.includes(id);
  const length = isLive ? LIVE_SECONDS : (clipSeconds[id] ?? VIDEO_SECONDS);
  const centers = isLive
    ? placePeaks(length, 12, 30)
    : // Short clips get fewer peaks so that they stay more than mergeWithinSeconds apart.
      placePeaks(length, Math.max(1, Math.min(2 + Math.floor(rand() * 3), Math.floor((length - 40) / 35))), 20);
  const timeline = makeTimeline(length, centers);
  writeFileSync(join(OUT_DIR, "comments", `${id}.json`), JSON.stringify(timeline));

  centers.forEach((c, i) => {
    const next = centers[i + 1] ?? length;
    summaries.push({
      videoId: id,
      from: Math.max(0, c - 15),
      to: Math.min(length, Math.max(c + 15, next - 15)),
      oneLine: PEAK_LINES[lineIndex++ % PEAK_LINES.length],
      recap: "",
    });
  });
  console.log(`${id}: ${timeline.length} comments, peaks at ${centers.join(", ")}`);
}

writeFileSync(
  join(OUT_DIR, "summaries.json"),
  JSON.stringify({ peaks: summaries, liveRecaps: LIVE_RECAPS }, null, 2),
);
console.log("wrote summaries.json");
