import type { CommentEvent, MockVideo, PoolItem, SummaryData } from "../types";

export interface RankingFile {
  source: "snapshot" | "mock";
  fetchedAt: string;
  pool: PoolItem[];
  tagsFetchedAt?: string;
  tagPools?: Record<string, PoolItem[]>; // preset tag -> popular videos (last 30 days)
}

export interface BlocklistFile {
  items: { id: string; title: string; reason: string }[];
}

export interface DataSource {
  name: "snapshot" | "mock";
  loadRanking(): Promise<RankingFile>;
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(import.meta.env.BASE_URL + url.replace(/^\//, ""));
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return (await res.json()) as T;
}

export function loadComments(mockId: string): Promise<CommentEvent[]> {
  return fetchJson<CommentEvent[]>(`/data/comments/${mockId}.json`);
}

export function loadSummaries(): Promise<SummaryData> {
  return fetchJson<SummaryData>("/data/summaries.json");
}

// Missing when the test-pattern videos (scripts/generate-videos.sh) are used.
export async function loadMockVideos(): Promise<MockVideo[]> {
  try {
    return await fetchJson<MockVideo[]>("/data/videos.json");
  } catch {
    return [];
  }
}

export async function loadBlocklist(): Promise<Set<string>> {
  try {
    const file = await fetchJson<BlocklistFile>("/data/blocklist.json");
    return new Set(file.items.map((i) => i.id));
  } catch {
    return new Set();
  }
}
