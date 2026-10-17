importScripts("video-id.js");

const MENU_ADD_LINK = "zap-stack-add-link";
const MENU_ADD_PAGE = "zap-stack-add-page";

const VIDEO_URL_PATTERNS = [
  "*://www.youtube.com/watch*",
  "*://m.youtube.com/watch*",
  "*://www.youtube.com/shorts/*",
  "*://youtu.be/*",
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ADD_LINK,
      title: "Zap Stack に追加",
      contexts: ["link"],
      targetUrlPatterns: VIDEO_URL_PATTERNS,
      documentUrlPatterns: ["https://www.youtube.com/*"],
    });
    chrome.contextMenus.create({
      id: MENU_ADD_PAGE,
      title: "この動画を Zap Stack に追加",
      contexts: ["page", "video"],
      documentUrlPatterns: [
        "https://www.youtube.com/watch*",
        "https://www.youtube.com/shorts/*",
      ],
    });
  });
});

async function sendToTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // The content script is missing when the tab was opened before the
    // extension was installed or reloaded. Inject it and retry once.
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["video-id.js", "content.js"] });
    await chrome.tabs.sendMessage(tabId, message);
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  const sourceUrl = info.menuItemId === MENU_ADD_LINK ? info.linkUrl : info.pageUrl;
  const videoId = zapStackExtractVideoId(sourceUrl);
  if (!videoId) {
    console.warn("[zap-stack] Could not extract a video ID from", sourceUrl);
    return;
  }

  sendToTab(tab.id, { type: "zap-stack:add", videoId }).catch((err) => {
    console.error("[zap-stack] Failed to deliver message to tab", err);
  });
});
