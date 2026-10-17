// Fetch a pool of recent videos from Snapshot Search API v2 once (per category x metric),
// and save them as public/data/ranking.json. Thumbnails are not downloaded (copyright);
// the app shows a frame of the CC BY mock video instead.
// The app builds the top-10 list from this pool for the selected metric and categories.
// Also fetches the popular videos for each preset tag (TAGS) into tagPools, used by the
// tag (auto) mode and the manual add search.
// Thumbnails are downloaded only for THUMBNAIL_TAGS, as-is and mosaicked
// (public/thumbnails/real, public/thumbnails/mosaic). Other videos show a mock frame.
// Also writes public/data/ranking.mock.json (fictional titles) as a fallback.
// Usage: NODE_USE_ENV_PROXY=1 node scripts/fetch-ranking.ts [--mock-only | --tags-only]
//   --tags-only: keep the existing ranking pool and refetch only tagPools
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "public/data");
const THUMB_DIR = join(ROOT, "public/thumbnails");
const MOSAIC_BLOCK = 16; // px per mosaic cell on a 320x180 thumbnail
const ENDPOINT = "https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search";
const APP_NAME = "nico-zap";
const DAYS = 7;
const TAG_DAYS = 30;
const PER_QUERY = 20;
const REQUEST_INTERVAL_MS = 500;

// Keep in sync with CATEGORIES in src/config.ts.
const GENRES = [
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
// Only these genres enter the pool. Others (例のソレ, 社会・政治・時事, その他, ...) are
// not shown in the demo because they were not reviewed for suitability.
const ALLOWED_GENRES = new Set(GENRES);

// Keep in sync with PRESET_TAGS in src/config.ts.
const TAGS = [
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
// Tags whose videos get real thumbnails.
const THUMBNAIL_TAGS = ["VOICEROIDキッチン"];
// Videos carrying any of these tags never enter the pools (not suitable for a public demo).
const DENY_TAGS = new Set([
  "例のアレ", "真夏の夜の淫夢", "淫夢", "ホモと見るシリーズ", "R-18", "政治", "エロ", "グロ",
  "R-15", "閲覧注意", "ホラー", "戦争", "事件",
]);

const decodeEntities = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const SORTS = ["viewCounter", "commentCounter", "likeCounter", "mylistCounter"];

interface ApiItem {
  contentId: string;
  title: string;
  genre: string | null;
  viewCounter: number;
  commentCounter: number;
  likeCounter: number;
  mylistCounter: number;
  lengthSeconds: number;
  startTime: string;
  tags: string;
  thumbnailUrl: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Query {
  sort: string;
  limit: number;
  genre?: string;
  tag?: string;
}

async function search({ sort, limit, genre, tag }: Query): Promise<ApiItem[]> {
  const since = new Date(Date.now() - (tag ? TAG_DAYS : DAYS) * 24 * 3600 * 1000).toISOString();
  const params = new URLSearchParams({
    q: tag ?? "",
    targets: tag ? "tagsExact" : "title",
    fields:
      "contentId,title,genre,tags,viewCounter,commentCounter,likeCounter,mylistCounter,lengthSeconds,startTime,thumbnailUrl",
    "filters[startTime][gte]": since,
    _sort: `-${sort}`,
    _limit: String(limit),
    _context: APP_NAME,
  });
  // Keeps keyword-less searches well under 100k hits.
  if (!tag) params.set("filters[viewCounter][gte]", "100");
  if (genre) params.set("filters[genre][0]", genre);
  const res = await fetch(`${ENDPOINT}?${params}`, { headers: { "User-Agent": APP_NAME } });
  if (!res.ok) throw new Error(`API error: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { meta: { totalCount: number }; data: ApiItem[] };
  console.log(`${tag ? `#${tag}` : (genre ?? "(all)")} -${sort}: totalCount=${body.meta.totalCount}`);
  return body.data;
}

function suitable(d: ApiItem): boolean {
  // "ss" ids are shorts, which the official ranking excludes too.
  if (!d.genre || !ALLOWED_GENRES.has(d.genre) || d.contentId.startsWith("ss")) return false;
  return !(d.tags ?? "").split(" ").some((t) => DENY_TAGS.has(t));
}

function toPoolItem(d: ApiItem, thumbnail: string | null = null) {
  return {
    id: d.contentId,
    title: decodeEntities(d.title),
    genre: d.genre,
    tags: (d.tags ?? "").split(" ").filter(Boolean),
    viewCounter: d.viewCounter,
    commentCounter: d.commentCounter,
    likeCounter: d.likeCounter,
    mylistCounter: d.mylistCounter,
    lengthSeconds: d.lengthSeconds,
    startTime: d.startTime,
    thumbnail,
  };
}

async function collect(queries: Query[]): Promise<ApiItem[]> {
  const found = new Map<string, ApiItem>();
  for (const q of queries) {
    for (const d of await search(q)) if (suitable(d)) found.set(d.contentId, d);
    await sleep(REQUEST_INTERVAL_MS);
  }
  return [...found.values()];
}

async function fetchPool() {
  const found = await collect(
    [null, ...GENRES].flatMap((genre) =>
      SORTS.map((sort) => ({ sort, genre: genre ?? undefined, limit: genre ? PER_QUERY : PER_QUERY * 2 })),
    ),
  );
  return found.map((d) => toPoolItem(d));
}

async function fetchTagPools() {
  const tagPools: Record<string, ReturnType<typeof toPoolItem>[]> = {};
  for (const tag of TAGS) {
    const found = await collect(SORTS.map((sort) => ({ sort, tag, limit: PER_QUERY })));
    const thumbs = THUMBNAIL_TAGS.includes(tag) ? await fetchThumbnails(found) : new Set<string>();
    tagPools[tag] = found.map((d) => toPoolItem(d, thumbs.has(d.contentId) ? d.contentId : null));
  }
  return tagPools;
}

// Downloads the 320x180 (".M") thumbnail and writes a mosaicked copy next to it.
async function fetchThumbnails(items: ApiItem[]): Promise<Set<string>> {
  mkdirSync(join(THUMB_DIR, "real"), { recursive: true });
  mkdirSync(join(THUMB_DIR, "mosaic"), { recursive: true });
  const done = new Set<string>();
  for (const d of items) {
    const real = join(THUMB_DIR, "real", `${d.contentId}.jpg`);
    const mosaic = join(THUMB_DIR, "mosaic", `${d.contentId}.jpg`);
    try {
      if (!existsSync(real)) {
        const res = await fetch(`${d.thumbnailUrl}.M`, { headers: { "User-Agent": APP_NAME } });
        if (!res.ok) throw new Error(String(res.status));
        writeFileSync(real, Buffer.from(await res.arrayBuffer()));
        await sleep(200);
      }
      execFileSync("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y", "-i", real,
        "-vf", `scale=iw/${MOSAIC_BLOCK}:ih/${MOSAIC_BLOCK},scale=iw*${MOSAIC_BLOCK}:ih*${MOSAIC_BLOCK}:flags=neighbor`,
        mosaic,
      ]);
      done.add(d.contentId);
    } catch (e) {
      console.warn(`thumbnail failed: ${d.contentId}`, e);
    }
  }
  console.log(`thumbnails: ${done.size}/${items.length}`);
  return done;
}

async function fetchAll(tagsOnly: boolean) {
  const file = join(DATA_DIR, "ranking.json");
  let pool;
  let fetchedAt = new Date().toISOString();
  if (tagsOnly && existsSync(file)) {
    const current = JSON.parse(readFileSync(file, "utf8"));
    pool = current.pool;
    fetchedAt = current.fetchedAt;
  } else {
    pool = await fetchPool();
  }
  const tagPools = await fetchTagPools();
  writeFileSync(
    file,
    JSON.stringify(
      { source: "snapshot", fetchedAt, tagsFetchedAt: new Date().toISOString(), pool, tagPools },
      null,
      2,
    ),
  );
  const tagged = Object.entries(tagPools).map(([t, v]) => `${t}:${v.length}`).join(" ");
  console.log(`wrote ranking.json (${pool.length} videos in pool; tags ${tagged})`);
}

function writeMockRanking() {
  const titles: [string, string, string[]][] = [
    ["【踊ってみた】新曲を全力で踊ってみた", "ダンス", ["踊ってみた"]],
    ["【実況】伝説の高難度ステージに挑戦", "ゲーム", ["ゲーム実況"]],
    ["【歌ってみた】夜明けのメロディ", "音楽・サウンド", ["歌ってみた"]],
    ["【雑談】まったり企画会議", "エンターテイメント", ["雑談"]],
    ["【料理】30分で作る本格カレー", "料理", ["料理"]],
    ["【MAD】名シーン総集編", "アニメ", ["MAD"]],
    ["【演奏してみた】ピアノで弾く人気アニメOP", "音楽・サウンド", ["演奏してみた"]],
    ["【実況】耐久ゲーム クリアまで終われません", "ゲーム", ["ゲーム実況"]],
    ["【解説】初心者向け 作曲のはじめかた", "解説・講座", ["VOCALOID"]],
    ["【手描き】オリジナルキャラで短編アニメ", "アニメ", ["描いてみた"]],
    ["【ゆっくり解説】宇宙のふしぎ", "解説・講座", ["ゆっくり解説"]],
    ["【RTA】最速クリアに挑戦", "ゲーム", ["RTA", "ゲーム実況"]],
    ["【旅動画】電車で行く温泉めぐり", "旅行・アウトドア", ["旅行", "鉄道"]],
    ["【電子工作】光るキーボードを自作", "技術・工作", ["電子工作"]],
    ["【料理】おばあちゃんの味噌汁", "料理", ["料理"]],
    ["【ボカロ】オリジナル曲 第3弾", "音楽・サウンド", ["VOCALOID", "初音ミク"]],
  ];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pool = titles.map(([title, genre, tags], i) => ({
    id: `mock-item-${i + 1}`,
    title,
    genre,
    tags,
    viewCounter: Math.round(5000 + rand() * 200000),
    commentCounter: Math.round(500 + rand() * 30000),
    likeCounter: Math.round(100 + rand() * 5000),
    mylistCounter: Math.round(10 + rand() * 2000),
    lengthSeconds: 180,
    startTime: new Date().toISOString(),
  }));
  const tagPools = Object.fromEntries(TAGS.map((t) => [t, pool.filter((p) => p.tags.includes(t))]));
  writeFileSync(
    join(DATA_DIR, "ranking.mock.json"),
    JSON.stringify({ source: "mock", fetchedAt: new Date().toISOString(), pool, tagPools }, null, 2),
  );
  console.log("wrote ranking.mock.json");
}

mkdirSync(DATA_DIR, { recursive: true });
writeMockRanking();
if (!process.argv.includes("--mock-only")) {
  await fetchAll(process.argv.includes("--tags-only"));
}
