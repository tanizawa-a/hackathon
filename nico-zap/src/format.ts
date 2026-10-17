export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}分${s % 60}秒` : `${s}秒`;
}

export function formatCount(n: number): string {
  return n >= 10000 ? `${(n / 10000).toFixed(1)}万` : n.toLocaleString("ja-JP");
}

export function thumbnailSrc(item: { thumbnail: string; realThumbnail: string | null }, style: "real" | "mosaic" | "off"): string {
  if (!item.realThumbnail || style === "off") return item.thumbnail;
  return `${import.meta.env.BASE_URL}thumbnails/${style}/${item.realThumbnail}.jpg`;
}
