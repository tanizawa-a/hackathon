// Shared by the background service worker (importScripts) and content.js.
// Returns the 11-character YouTube video ID for a watch / shorts / youtu.be
// URL, or null. Relative URLs are resolved against youtube.com.
globalThis.zapStackExtractVideoId = (rawUrl) => {
  let url;
  try {
    url = new URL(rawUrl, "https://www.youtube.com");
  } catch {
    return null;
  }

  let id = null;
  if (url.hostname === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0];
  } else if (url.pathname === "/watch") {
    id = url.searchParams.get("v");
  } else {
    const match = url.pathname.match(/^\/(shorts|embed|live)\/([^/?#]+)/);
    if (match) id = match[2];
  }

  return id && /^[\w-]{11}$/.test(id) ? id : null;
};
