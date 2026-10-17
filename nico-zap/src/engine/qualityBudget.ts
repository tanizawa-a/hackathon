import { QUALITY_ORDER, QUALITY_PIXELS, config } from "../config";
import type { Quality } from "../types";

export interface BudgetTile {
  slot: number;
  rank: number;
  rate: number;
}

export interface BudgetResult {
  qualities: Record<number, Quality>;
  backgroundMpx: number; // background tiles while the grid is playing
  budgetMpx: number;
  mainMpx: number; // zoomed video (excluded from the budget)
}

export function costMpx(quality: Quality, rate: number, fps = config.quality.fps): number {
  return (QUALITY_PIXELS[quality] * fps * rate) / 1e6;
}

// Start every background tile at the default quality and step down the lowest-ranked
// tiles one level at a time until the total fits in the budget.
export function allocateQuality(
  tiles: BudgetTile[],
  budgetMpx = config.quality.budgetMpxPerSec,
  zoomed = false,
): BudgetResult {
  const qualities: Record<number, Quality> = {};
  for (const t of tiles) qualities[t.slot] = config.quality.background;
  const total = () => tiles.reduce((sum, t) => sum + costMpx(qualities[t.slot], t.rate), 0);

  const byPriority = [...tiles].sort((a, b) => b.rank - a.rank);
  let changed = true;
  while (total() > budgetMpx && changed) {
    changed = false;
    for (const t of byPriority) {
      const level = QUALITY_ORDER.indexOf(qualities[t.slot]);
      if (level > 0) {
        qualities[t.slot] = QUALITY_ORDER[level - 1];
        changed = true;
        break;
      }
    }
  }
  return {
    qualities,
    backgroundMpx: total(),
    budgetMpx,
    mainMpx: zoomed ? costMpx(config.quality.main, 1) : 0,
  };
}
