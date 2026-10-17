import type { PoolItem, RankingMetric } from "../types";

// The official "総合" ranking formula is not public. This is a demo approximation that
// mixes all four counters (views + comments + likes x 5 + mylists x 15).
export function score(item: PoolItem, metric: RankingMetric): number {
  switch (metric) {
    case "total":
      return item.viewCounter + item.commentCounter + item.likeCounter * 5 + item.mylistCounter * 15;
    case "view":
      return item.viewCounter;
    case "comment":
      return item.commentCounter;
    case "like":
      return item.likeCounter;
    case "mylist":
      return item.mylistCounter;
  }
}

// Categories are genre names; an empty selection means all genres.
export function rank(
  pool: PoolItem[],
  metric: RankingMetric,
  categories: string[],
  blocked: Set<string>,
  limit: number,
): PoolItem[] {
  return pool
    .filter((p) => !blocked.has(p.id) && (categories.length === 0 || (p.genre && categories.includes(p.genre))))
    .sort((a, b) => score(b, metric) - score(a, metric))
    .slice(0, limit);
}

// Every known video (genre pool + all tag pools), deduplicated by id.
export function allItems(pool: PoolItem[], tagPools: Record<string, PoolItem[]> = {}): PoolItem[] {
  const map = new Map<string, PoolItem>();
  for (const p of [...pool, ...Object.values(tagPools).flat()]) {
    // Keep the copy that has a downloaded thumbnail.
    if (!map.get(p.id)?.thumbnail) map.set(p.id, p);
  }
  return [...map.values()];
}

// Videos tagged exactly `tag`. Preset tags have a dedicated pool; other tags only
// match videos that happen to be in the downloaded pools.
export function withTag(items: PoolItem[], tag: string): PoolItem[] {
  const t = tag.trim().toLowerCase();
  return items.filter((p) => p.tags.some((x) => x.toLowerCase() === t));
}

// Title or tag substring search for manual add.
export function search(items: PoolItem[], query: string, blocked: Set<string>, limit: number): PoolItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return items
    .filter(
      (p) =>
        !blocked.has(p.id) &&
        (p.title.toLowerCase().includes(q) || p.id === q || p.tags.some((t) => t.toLowerCase().includes(q))),
    )
    .sort((a, b) => score(b, "total") - score(a, "total"))
    .slice(0, limit);
}

// Extracts a content id from "sm9", "so123" or a nicovideo.jp / nico.ms URL.
export function parseVideoId(input: string): string | null {
  return input.match(/\b((?:sm|so|nm)\d+)\b/)?.[1] ?? null;
}
