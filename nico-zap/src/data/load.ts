import { config } from "../config";
import { detectPeaks } from "../engine/excitement";
import { allItems, rank, score, withTag } from "../engine/ranking";
import type { CommentEvent, MockVideo, Peak, PoolItem, RankingMetric, SummaryData, VideoItem } from "../types";
import { mockSource } from "./mockSource";
import { snapshotSource } from "./snapshotSource";
import { loadBlocklist, loadComments, loadMockVideos, loadSummaries, type RankingFile } from "./source";

export interface DemoData {
  ranking: RankingFile;
  items: PoolItem[]; // genre pool + tag pools, deduplicated
  blocked: Set<string>;
  mockVideos: Record<string, MockVideo>;
  comments: Record<string, CommentEvent[]>;
  peaks: Record<string, Peak[]>;
  summaries: SummaryData;
}

async function loadRankingWithFallback(): Promise<RankingFile> {
  if (config.dataSource === "snapshot") {
    try {
      return await snapshotSource.loadRanking();
    } catch (e) {
      console.warn("snapshot ranking unavailable, falling back to mock", e);
    }
  }
  return mockSource.loadRanking();
}

export const mockIds = Array.from({ length: config.rankingSize }, (_, i) => `mock${String(i + 1).padStart(2, "0")}`);

export function timelineLength(item: VideoItem): number {
  return item.kind === "live" ? config.liveLengthSeconds : item.clipSeconds;
}

// Only 240p mock files exist; quality switching is simulated (label and budget only).
function sourcesOf(mockId: string): VideoItem["sources"] {
  const file = `${import.meta.env.BASE_URL}videos/${mockId}_240p.mp4`;
  return { "240p": file, "360p": file, "720p": file };
}

interface ItemOptions {
  index: number; // 0-based position; picks the mock video (cycled when over 10)
  badge: string;
  allowLive: boolean; // only the ranking mode has live tiles
}

// Real metadata from the pool, played with a mock video.
// Real thumbnails are not used (copyright); a frame of the mock video is shown instead.
export function toVideoItem(p: PoolItem, opts: ItemOptions, mockVideos: Record<string, MockVideo>): VideoItem {
  const mockId = mockIds[opts.index % mockIds.length];
  const live = opts.allowLive && config.liveMockIds.includes(mockId);
  const mock = mockVideos[mockId];
  return {
    id: p.id,
    mockId,
    title: p.title,
    genre: p.genre,
    kind: live ? "live" : "video",
    rank: opts.index + 1,
    badge: opts.badge,
    lengthSeconds: live ? config.liveLengthSeconds : p.lengthSeconds,
    viewCounter: p.viewCounter,
    commentCounter: p.commentCounter,
    likeCounter: p.likeCounter,
    thumbnail: `${import.meta.env.BASE_URL}thumbnails/${mockId}.jpg`,
    realThumbnail: p.thumbnail ?? null,
    clipSeconds: mock?.clipSeconds ?? config.mockVideoSeconds,
    credit: mock?.credit ?? null,
    sources: sourcesOf(mockId),
  };
}

export function buildRanking(data: DemoData, metric: RankingMetric, categories: string[]): VideoItem[] {
  return rank(data.ranking.pool, metric, categories, data.blocked, config.rankingSize).map((p, i) =>
    toVideoItem(p, { index: i, badge: `${i + 1}位`, allowLive: true }, data.mockVideos),
  );
}

// Tag (auto) mode: popular videos for the tag, ordered by the selected metric.
export function buildTagRanking(data: DemoData, tag: string, metric: RankingMetric): VideoItem[] {
  const preset = data.ranking.tagPools?.[tag];
  const candidates = preset ?? withTag(data.items, tag);
  return candidates
    .filter((p) => !data.blocked.has(p.id))
    .sort((a, b) => score(b, metric) - score(a, metric))
    .slice(0, config.rankingSize)
    .map((p, i) => toVideoItem(p, { index: i, badge: `${i + 1}位`, allowLive: false }, data.mockVideos));
}

// Manual mode: a video picked by the user. Unknown ids get placeholder metadata.
export function buildManualItem(data: DemoData, idOrItem: string | PoolItem, index: number): VideoItem {
  const p =
    typeof idOrItem === "string"
      ? (data.items.find((x) => x.id === idOrItem) ?? {
          id: idOrItem,
          title: `${idOrItem}（一覧にない動画）`,
          genre: null,
          tags: [],
          viewCounter: 0,
          commentCounter: 0,
          likeCounter: 0,
          mylistCounter: 0,
          lengthSeconds: 0,
          startTime: "",
        })
      : idOrItem;
  // A video may sit in the genre pool without a thumbnail and in a tag pool with one.
  const withThumb = data.items.find((x) => x.id === p.id && x.thumbnail) ?? p;
  return toVideoItem(withThumb, { index, badge: `${index + 1}本目`, allowLive: false }, data.mockVideos);
}

export async function loadDemoData(): Promise<DemoData> {
  const [ranking, blocked, videoList, summaries, commentList] = await Promise.all([
    loadRankingWithFallback(),
    loadBlocklist(),
    loadMockVideos(),
    loadSummaries(),
    Promise.all(mockIds.map((id) => loadComments(id))),
  ]);
  const mockVideos = Object.fromEntries(videoList.map((v) => [v.mockId, v]));
  const comments: Record<string, CommentEvent[]> = {};
  const peaks: Record<string, Peak[]> = {};
  mockIds.forEach((id, i) => {
    comments[id] = commentList[i];
    const length = config.liveMockIds.includes(id)
      ? config.liveLengthSeconds
      : (mockVideos[id]?.clipSeconds ?? config.mockVideoSeconds);
    peaks[id] = detectPeaks(commentList[i], length);
  });
  // Older ranking files have no tags.
  for (const p of [...ranking.pool, ...Object.values(ranking.tagPools ?? {}).flat()]) {
    p.tags ??= [];
    p.thumbnail ??= null;
  }
  const items = allItems(ranking.pool, ranking.tagPools);
  return { ranking, items, blocked, mockVideos, comments, peaks, summaries };
}
