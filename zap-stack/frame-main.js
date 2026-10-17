// Runs in the page's main world inside every youtube.com frame, but only acts
// in tile frames. content.js (isolated world) cannot call the player's own
// methods, so it requests a quality through a data attribute on the tile
// document's root element and this script applies it.
(() => {
  if (window === window.top) return;

  const ATTR = "data-zap-stack-quality";
  const CHECK_INTERVAL_MS = 1000;
  // Quality labels used by the YouTube player, highest first.
  const QUALITY_ORDER = [
    "highres",
    "hd2160",
    "hd1440",
    "hd1080",
    "hd720",
    "large",
    "medium",
    "small",
    "tiny",
  ];
  const TARGETS = {
    low: "medium", // 360p for grid tiles
    mid: "large", // 480p for tiles in the maximized panel
    high: "hd1080", // zoomed tile
  };

  let applied = null;

  // Pick the highest available level that does not exceed the target.
  function chooseLevel(player, target) {
    const available = player.getAvailableQualityLevels?.() ?? [];
    const maxIndex = QUALITY_ORDER.indexOf(target);
    return QUALITY_ORDER.slice(maxIndex).find((q) => available.includes(q)) ?? null;
  }

  function check() {
    const requested = document.documentElement.getAttribute(ATTR);
    const target = TARGETS[requested];
    if (!target) return;

    const player = document.getElementById("movie_player");
    if (typeof player?.setPlaybackQualityRange !== "function") return;
    // Ads have their own quality levels; wait for the video itself.
    if (player.classList.contains("ad-showing")) return;

    const level = chooseLevel(player, target);
    if (!level) return;

    // Re-apply only when needed: every change makes the player rebuffer.
    const key = `${player.getVideoData?.().video_id}:${level}`;
    if (applied === key && player.getPlaybackQuality?.() === level) return;

    player.setPlaybackQualityRange(level, level);
    player.setPlaybackQuality?.(level);
    applied = key;
  }

  setInterval(check, CHECK_INTERVAL_MS);
})();
