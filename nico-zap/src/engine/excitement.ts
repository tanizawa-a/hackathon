import { config } from "../config";
import type { CommentEvent, Peak } from "../types";

export function countPerSecond(comments: CommentEvent[], length: number): number[] {
  const counts = new Array<number>(Math.ceil(length)).fill(0);
  for (const c of comments) {
    const s = Math.floor(c.t);
    if (s >= 0 && s < counts.length) counts[s]++;
  }
  return counts;
}

// Centered moving average.
export function movingAverage(values: number[], window: number): number[] {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < values.length) {
        sum += values[j];
        n++;
      }
    }
    return sum / n;
  });
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Offline peak detection for the whole timeline (video mode, and simplified live mode).
export function detectPeaks(comments: CommentEvent[], length: number, opts = config.excitement): Peak[] {
  const ma = movingAverage(countPerSecond(comments, length), opts.movingAverageSeconds);
  const normal = Math.max(median(ma), 0.1);
  const threshold = Math.max(normal * opts.thresholdRatio, opts.minRatePerSecond);

  const raw: Peak[] = [];
  let best: Peak | null = null;
  ma.forEach((v, t) => {
    if (v > threshold) {
      if (!best || v / normal > best.score) best = { t, score: v / normal };
    } else if (best) {
      raw.push(best);
      best = null;
    }
  });
  if (best) raw.push(best);

  const merged: Peak[] = [];
  for (const p of raw) {
    const last = merged[merged.length - 1];
    if (last && p.t - last.t <= opts.mergeWithinSeconds) {
      if (p.score > last.score) merged[merged.length - 1] = p;
    } else {
      merged.push(p);
    }
  }
  return merged;
}

export function glowingPeak(peaks: Peak[], t: number, opts = config.excitement): Peak | null {
  return peaks.find((p) => t >= p.t - opts.glowLeadSeconds && t <= p.t + opts.glowTailSeconds) ?? null;
}

export type Segment = [start: number, end: number];

// Highlight playback: [peak - lead, peak - lead + segment], merged when overlapping.
export function highlightSegments(peaks: Peak[], length: number, opts = config.highlight): Segment[] {
  const segments: Segment[] = [];
  for (const p of peaks) {
    const start = Math.max(0, p.t - opts.leadSeconds);
    const end = Math.min(length, start + opts.segmentSeconds);
    const last = segments[segments.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else segments.push([start, end]);
  }
  return segments;
}

// Position to play at for time t in highlight mode, or null when no segment is left.
export function nextPlayablePosition(segments: Segment[], t: number): number | null {
  for (const [start, end] of segments) {
    if (t < start) return start;
    if (t < end) return t;
  }
  return null;
}

// Number of comments in (t - window, t].
export function recentCount(comments: CommentEvent[], t: number, window: number): number {
  return upperBound(comments, t) - upperBound(comments, t - window);
}

// Index of the first comment with c.t > t (comments are sorted by t).
export function upperBound(comments: CommentEvent[], t: number): number {
  let lo = 0;
  let hi = comments.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (comments[mid].t <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function recentComments(comments: CommentEvent[], t: number, window: number, max: number): CommentEvent[] {
  const end = upperBound(comments, t);
  const start = Math.max(upperBound(comments, t - window), end - max);
  return comments.slice(start, end).reverse();
}
