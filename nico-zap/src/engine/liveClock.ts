import { config } from "../config";
import type { Peak } from "../types";

// Pseudo live clock. Keeps running while the tile is paused or hidden.
let startedAt: number | null = null;
const lastFocused: Record<string, number> = {};
const recapCursor: Record<string, number> = {};

export function startLiveClock() {
  startedAt ??= performance.now();
}

export function liveStartPosition(mockId: string): number {
  return config.liveStartSeconds[mockId] ?? 0;
}

export function liveTime(mockId: string): number {
  const elapsed = startedAt === null ? 0 : (performance.now() - startedAt) / 1000;
  return Math.min(config.liveLengthSeconds, liveStartPosition(mockId) + elapsed);
}

export interface UnseenRange {
  from: number;
  to: number;
}

// Range since the viewer last focused (zoomed) this broadcast, or since the demo started.
export function unseenRange(mockId: string): UnseenRange {
  return { from: lastFocused[mockId] ?? liveStartPosition(mockId), to: liveTime(mockId) };
}

export function markFocused(mockId: string, t = liveTime(mockId)) {
  lastFocused[mockId] = t;
}

export function nextRecap(mockId: string, recaps: Record<string, string[]>): string {
  const list = recaps[mockId] ?? [];
  if (list.length === 0) return "";
  const i = recapCursor[mockId] ?? 0;
  recapCursor[mockId] = (i + 1) % list.length;
  return list[i];
}

export function peaksIn(peaks: Peak[], range: UnseenRange): Peak[] {
  return peaks.filter((p) => p.t >= range.from && p.t <= range.to);
}
