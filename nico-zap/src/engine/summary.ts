import type { Summary } from "../types";

// summaries.json stores each peak as [center - LEAD, ...]; see scripts/generate-comments.ts.
const LEAD = 15;

// Latest summary whose peak center is already behind `t` (never shows future sections).
export function summaryAt(summaries: Summary[], videoId: string, t: number): Summary | null {
  let found: Summary | null = null;
  for (const s of summaries) {
    if (s.videoId !== videoId) continue;
    const center = Math.min(s.from + LEAD, s.to);
    if (center <= t && (!found || s.from > found.from)) found = s;
  }
  return found;
}
