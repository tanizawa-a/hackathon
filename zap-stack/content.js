(() => {
  if (window.__zapStackLoaded) return;
  window.__zapStackLoaded = true;

  // Each tile is a regular youtube.com watch page loaded in a same-origin
  // iframe, so its <video> element can be controlled directly. The embedded
  // player (/embed) is not used: it fails with error 152-4 on youtube.com and
  // is subject to the embedded player autoplay rules.
  const MAX_TILES = 4;
  const PLAYBACK_RATES = [1, 1.5, 2];
  const SYNC_INTERVAL_MS = 500;
  const LOAD_TIMEOUT_MS = 20000;
  const FRAME_STYLE_ID = "zap-stack-frame-style";
  const QUALITY_ATTR = "data-zap-stack-quality";
  // Volume of each tile while several tiles play with sound at once.
  const MULTI_VOLUME = 0.5;
  // Fade-in when a tile becomes audible or louder (zoom, unzoom), so the
  // change in loudness is not abrupt.
  const VOLUME_FADE_MS = 800;

  // Injected into each tile's watch page so that only the player is visible.
  // Player controls are hidden except while an ad is showing, so the ad UI
  // (skip button, ad progress) stays usable.
  const FRAME_CSS = `
    html, body {
      overflow: hidden !important;
      background: #000 !important;
    }
    #masthead-container,
    ytd-popup-container,
    tp-yt-iron-overlay-backdrop,
    ytd-miniplayer {
      display: none !important;
    }
    /* Everything else on the watch page is covered by the player anyway.
       Removing it from layout keeps the page from rendering it and stops
       comments from lazy-loading while they would scroll into view. */
    #below,
    #secondary,
    #chat-container,
    ytd-comments,
    ytd-live-chat-frame,
    ytd-engagement-panel-section-list-renderer {
      display: none !important;
    }
    #movie_player {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      background: #000 !important;
    }
    #movie_player .html5-video-container,
    #movie_player video {
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      height: 100% !important;
    }
    #movie_player video {
      object-fit: contain !important;
    }
    #movie_player:not(.ad-showing) .ytp-chrome-top,
    #movie_player:not(.ad-showing) .ytp-chrome-bottom,
    #movie_player:not(.ad-showing) .ytp-gradient-top,
    #movie_player:not(.ad-showing) .ytp-gradient-bottom,
    #movie_player .ytp-pause-overlay,
    #movie_player .ytp-ce-element,
    #movie_player .ytp-endscreen-content {
      display: none !important;
    }
  `;

  const SEEK_SECONDS = 10;
  const SEEK_SECONDS_SHORT = 5;

  const ICONS = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M6 6l8.5 6L6 18zM16 6h2v12h-2z"/></svg>',
    rewind:
      '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>',
    forward:
      '<svg viewBox="0 0 24 24"><path d="M12 5V2l5 4-5 4V7a5 5 0 1 0 5 5h2a7 7 0 1 1-7-7z"/></svg>',
  };

  const state = {
    tiles: [], // { videoId, el, iframe, addedAt, video, isAd, errored, paused }
    zoomedId: null,
    rate: 1,
    collapsed: false,
    maximized: false,
    // Chrome blocks unmuted playback until the user has interacted with the
    // page. Tiles that had to fall back to muted are retried on the next
    // interaction (see unlockAudio).
    audioBlocked: false,
    // True while a link is being dragged over the page.
    dropActive: false,
  };

  // ---------------------------------------------------------------------------
  // Panel
  // ---------------------------------------------------------------------------

  const panel = document.createElement("div");
  panel.className = "zap-stack-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="zap-stack-header">
      <span class="zap-stack-title">Zap Stack</span>
      <span class="zap-stack-count"></span>
      <button type="button" class="zap-stack-btn zap-stack-icon-btn zap-stack-playall"></button>
      <div class="zap-stack-rates"></div>
      <button type="button" class="zap-stack-btn zap-stack-back" title="グリッドに戻る (Esc)">戻る</button>
      <button type="button" class="zap-stack-btn zap-stack-collapse" title="折りたたむ">－</button>
      <button type="button" class="zap-stack-btn zap-stack-maximize" title="最大化">□</button>
      <button type="button" class="zap-stack-btn zap-stack-clear" title="すべて閉じる">×</button>
    </div>
    <div class="zap-stack-grid"></div>
    <div class="zap-stack-empty">動画のリンクをここにドロップ</div>
    <div class="zap-stack-drop-hint">ドロップしてスタックに追加</div>
    <div class="zap-stack-toast" hidden></div>
    <div class="zap-stack-resize" data-corner="tl" title="ドラッグで大きさを変更"></div>
    <div class="zap-stack-resize" data-corner="tr" title="ドラッグで大きさを変更"></div>
    <div class="zap-stack-resize" data-corner="bl" title="ドラッグで大きさを変更"></div>
    <div class="zap-stack-resize" data-corner="br" title="ドラッグで大きさを変更"></div>
  `;

  const header = panel.querySelector(".zap-stack-header");
  const grid = panel.querySelector(".zap-stack-grid");
  const countEl = panel.querySelector(".zap-stack-count");
  const ratesEl = panel.querySelector(".zap-stack-rates");
  const playAllBtn = panel.querySelector(".zap-stack-playall");
  const backBtn = panel.querySelector(".zap-stack-back");
  const collapseBtn = panel.querySelector(".zap-stack-collapse");
  const maximizeBtn = panel.querySelector(".zap-stack-maximize");
  const clearBtn = panel.querySelector(".zap-stack-clear");
  const toastEl = panel.querySelector(".zap-stack-toast");
  const resizeHandles = panel.querySelectorAll(".zap-stack-resize");

  for (const rate of PLAYBACK_RATES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "zap-stack-btn zap-stack-rate";
    btn.dataset.rate = String(rate);
    btn.textContent = `${rate}x`;
    btn.addEventListener("click", () => setRate(rate));
    ratesEl.appendChild(btn);
  }

  backBtn.addEventListener("click", () => unzoom());
  playAllBtn.addEventListener("click", () => {
    const pause = !allPaused();
    for (const tile of state.tiles) tile.paused = pause;
    for (const tile of state.tiles) applyTileState(tile);
    render();
  });
  collapseBtn.addEventListener("click", () => {
    state.collapsed = !state.collapsed;
    if (state.collapsed) state.maximized = false;
    render();
  });
  maximizeBtn.addEventListener("click", () => {
    state.maximized = !state.maximized;
    if (state.maximized) state.collapsed = false;
    render();
  });
  clearBtn.addEventListener("click", () => {
    for (const tile of [...state.tiles]) removeTile(tile.videoId);
  });

  function mountPanel() {
    if (!panel.isConnected && document.body) {
      document.body.appendChild(panel);
    }
  }

  // YouTube is an SPA and normally keeps body children across navigations,
  // but re-attach defensively in case the body is swapped out.
  document.addEventListener("yt-navigate-finish", mountPanel);

  // ---------------------------------------------------------------------------
  // Tile frames
  // ---------------------------------------------------------------------------

  function getFrameDocument(tile) {
    try {
      return tile.iframe.contentDocument;
    } catch {
      return null;
    }
  }

  function injectFrameStyle(doc) {
    if (doc.getElementById(FRAME_STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = FRAME_STYLE_ID;
    style.textContent = FRAME_CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
  }

  function isVisible(el) {
    return el !== null && el.getClientRects().length > 0;
  }

  // Reads the player state from the tile's frame and re-applies the desired
  // playback state. YouTube's player may change mute/rate/paused on its own
  // (ads, buffering, autoplay), so this runs periodically.
  function syncTile(tile) {
    if (tile.errored) return;

    const doc = getFrameDocument(tile);
    if (!doc) {
      // The frame navigated to another origin (e.g. a sign-in or consent page).
      showTileError(tile, "ページを読み込めませんでした");
      return;
    }

    const loadTimedOut = Date.now() - tile.addedAt > LOAD_TIMEOUT_MS;
    if (doc.URL === "about:blank") {
      if (loadTimedOut) showTileError(tile, "ページを読み込めませんでした");
      return;
    }

    injectFrameStyle(doc);
    updateTileInfo(tile, doc);

    const player = doc.getElementById("movie_player");
    const errorEl = player?.querySelector(".ytp-error") ?? null;
    if (isVisible(errorEl)) {
      const reason = errorEl.querySelector(".ytp-error-content-wrap-reason")?.textContent.trim();
      showTileError(tile, reason || "この動画は再生できません");
      return;
    }

    const video = player?.querySelector("video") ?? null;
    if (!video) {
      if (loadTimedOut) showTileError(tile, "動画プレイヤーが見つかりませんでした");
      return;
    }

    if (tile.video !== video) {
      tile.video = video;
      // React to the player's own changes right away instead of waiting for
      // the next sync, e.g. to mute a tile that starts playing with sound.
      for (const type of ["play", "volumechange", "ratechange"]) {
        video.addEventListener(type, () => applyTileState(tile));
      }
      for (const type of ["timeupdate", "durationchange", "play", "pause"]) {
        video.addEventListener(type, () => updateControls(tile));
      }
    }
    tile.isAd = player.classList.contains("ad-showing");
    applyTileState(tile);
    updateTileStatus(tile);
    updateControls(tile);
  }

  // "(3) Video title - YouTube" -> "Video title"
  function cleanTitle(raw) {
    return raw
      .replace(/^\(\d+\+?\)\s*/, "")
      .replace(/\s*-\s*YouTube$/, "")
      .trim();
  }

  // Follow the video the tile is currently playing, which changes when the
  // watch page autoplays a related video.
  function updateTileInfo(tile, doc) {
    const currentId = new URL(doc.URL).searchParams.get("v");
    if (currentId && currentId !== tile.currentVideoId) {
      tile.currentVideoId = currentId;
      tile.el.dataset.videoId = currentId;
    }

    const title = cleanTitle(doc.title);
    if (title && title !== "YouTube" && tile.captionText.textContent !== title) {
      tile.captionText.textContent = title;
      tile.captionText.title = title;
    }
  }

  function syncAll() {
    for (const tile of state.tiles) syncTile(tile);
  }

  let syncTimer = null;
  function updateSyncLoop() {
    if (state.tiles.length > 0 && syncTimer === null) {
      syncTimer = setInterval(syncAll, SYNC_INTERVAL_MS);
    } else if (state.tiles.length === 0 && syncTimer !== null) {
      clearInterval(syncTimer);
      syncTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Tiles
  // ---------------------------------------------------------------------------

  function findTile(videoId) {
    return state.tiles.find((t) => t.videoId === videoId);
  }

  function addTile(videoId) {
    mountPanel();

    // Tiles move on to related videos by autoplay, so also compare against
    // what each tile is playing now.
    const existing = state.tiles.find(
      (t) => t.videoId === videoId || t.currentVideoId === videoId
    );
    if (existing) {
      flash(existing.el);
      showToast("すでにスタックにあります");
      return;
    }
    if (state.tiles.length >= MAX_TILES) {
      showToast(`スタックに入れられるのは${MAX_TILES}枚までです`);
      return;
    }

    const el = document.createElement("div");
    el.className = "zap-stack-tile is-loading";
    el.dataset.videoId = videoId;

    const screen = document.createElement("div");
    screen.className = "zap-stack-screen";
    screen.style.backgroundImage = `url("https://i.ytimg.com/vi/${videoId}/mqdefault.jpg")`;

    const iframe = document.createElement("iframe");
    iframe.src = `/watch?v=${encodeURIComponent(videoId)}`;
    iframe.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
    iframe.title = `YouTube video ${videoId}`;

    const loading = document.createElement("div");
    loading.className = "zap-stack-loading";
    loading.textContent = "読み込み中…";

    const badge = document.createElement("div");
    badge.className = "zap-stack-badge";
    badge.textContent = "広告中";

    const catcher = document.createElement("div");
    catcher.className = "zap-stack-catcher";
    catcher.title = "クリックでズーム";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "zap-stack-tile-close";
    closeBtn.title = "このタイルを閉じる";
    closeBtn.textContent = "×";

    const error = document.createElement("div");
    error.className = "zap-stack-error";
    error.hidden = true;

    const pausedMark = document.createElement("div");
    pausedMark.className = "zap-stack-paused-mark";
    pausedMark.innerHTML = ICONS.pause;

    // Playback controls, shown only on the zoomed tile. Placed below the
    // screen so they never cover the video.
    const controls = document.createElement("div");
    controls.className = "zap-stack-controls";
    controls.innerHTML = `
      <button type="button" class="zap-stack-icon-btn" data-action="rewind" title="${SEEK_SECONDS}秒戻す (J)">${ICONS.rewind}</button>
      <button type="button" class="zap-stack-icon-btn" data-action="toggle" title="一時停止 (K)">${ICONS.pause}</button>
      <button type="button" class="zap-stack-icon-btn" data-action="forward" title="${SEEK_SECONDS}秒送る (L)">${ICONS.forward}</button>
      <button type="button" class="zap-stack-icon-btn" data-action="next" title="次の動画 (Shift+N)">${ICONS.next}</button>
      <input type="range" class="zap-stack-seek" min="0" max="1000" step="1" value="0" aria-label="再生位置">
      <span class="zap-stack-time">0:00 / 0:00</span>
    `;

    // Shown below the screen so it never covers the video.
    const caption = document.createElement("div");
    caption.className = "zap-stack-caption";
    const captionText = document.createElement("span");
    captionText.className = "zap-stack-caption-text";
    captionText.textContent = "読み込み中…";
    const skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.className = "zap-stack-icon-btn zap-stack-skip";
    skipBtn.title = "次の関連動画にスキップ";
    skipBtn.innerHTML = ICONS.next;
    caption.append(captionText, skipBtn);

    screen.append(iframe, loading, badge, pausedMark, catcher, closeBtn, error);
    el.append(screen, controls, caption);

    const tile = {
      videoId,
      currentVideoId: videoId,
      el,
      iframe,
      captionText,
      controls,
      seek: controls.querySelector(".zap-stack-seek"),
      seeking: false,
      addedAt: Date.now(),
      video: null,
      isAd: false,
      errored: false,
      fade: null,
      paused: false,
    };

    iframe.addEventListener("load", () => syncTile(tile));
    catcher.addEventListener("click", () => {
      if (state.zoomedId === videoId) unzoom();
      else zoom(videoId);
    });
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeTile(videoId);
    });
    skipBtn.addEventListener("click", () => skipToNext(tile));
    controls.addEventListener("click", (e) => {
      const action = e.target.closest("button")?.dataset.action;
      if (action) runControl(tile, action);
    });
    tile.seek.addEventListener("pointerdown", () => {
      tile.seeking = true;
    });
    tile.seek.addEventListener("input", () => {
      const video = tile.video;
      if (!video || tile.isAd || !Number.isFinite(video.duration)) return;
      video.currentTime = (Number(tile.seek.value) / 1000) * video.duration;
    });
    tile.seek.addEventListener("change", () => {
      tile.seeking = false;
    });

    state.tiles.push(tile);
    grid.appendChild(el);
    render();
  }

  function removeTile(videoId) {
    const index = state.tiles.findIndex((t) => t.videoId === videoId);
    if (index === -1) return;
    const [tile] = state.tiles.splice(index, 1);
    // Unload the watch page before detaching so playback stops immediately.
    tile.iframe.src = "about:blank";
    tile.el.remove();
    if (state.zoomedId === videoId) {
      state.zoomedId = null;
      for (const t of state.tiles) applyTileState(t);
    }
    render();
  }

  function showTileError(tile, message) {
    tile.errored = true;
    if (tile.video) {
      tile.video.muted = true;
      tile.video.pause();
    }
    const errorEl = tile.el.querySelector(".zap-stack-error");
    errorEl.innerHTML = "";
    const text = document.createElement("p");
    text.textContent = message;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "zap-stack-btn";
    removeBtn.textContent = "削除する";
    removeBtn.addEventListener("click", () => removeTile(tile.videoId));
    errorEl.append(text, removeBtn);
    errorEl.hidden = false;
    tile.el.classList.remove("is-loading", "is-ad");
    tile.el.classList.add("is-error");
    if (state.zoomedId === tile.videoId) unzoom();
  }

  function updateTileStatus(tile) {
    const loading = !tile.video || tile.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA;
    tile.el.classList.toggle("is-loading", loading && !tile.isAd);
    tile.el.classList.toggle("is-ad", tile.isAd);
  }

  // ---------------------------------------------------------------------------
  // Zoom / playback control
  // ---------------------------------------------------------------------------

  // Bring a tile's <video> in line with the current zoom state and rate.
  function applyTileState(tile) {
    const video = tile.video;
    if (tile.errored || !video?.isConnected) return;

    const isZoomed = state.zoomedId === tile.videoId;
    const shouldMute = (state.zoomedId !== null && !isZoomed) || state.audioBlocked;

    // Applied by frame-main.js in the tile's main world.
    const root = video.ownerDocument.documentElement;
    const quality = isZoomed ? "high" : state.maximized ? "mid" : "low";
    if (root.getAttribute(QUALITY_ATTR) !== quality) root.setAttribute(QUALITY_ATTR, quality);

    applyVolume(tile, shouldMute);
    // YouTube forces 1x during ads; leave the rate alone until the ad ends.
    if (!tile.isAd && video.playbackRate !== state.rate) video.playbackRate = state.rate;
    if (tile.paused) {
      if (!video.paused) video.pause();
    } else if (video.paused && !video.ended) {
      video.play().catch((err) => {
        if (err.name !== "NotAllowedError" || video.muted) return;
        // Unmuted playback is not allowed yet: play muted for now.
        blockAudio();
        video.muted = true;
        video.play().catch(() => {});
      });
    }
  }

  function targetVolume(tile) {
    if (state.zoomedId !== null) return state.zoomedId === tile.videoId ? 1 : 0;
    const audible = state.tiles.filter((t) => !t.errored).length;
    return audible > 1 ? MULTI_VOLUME : 1;
  }

  // Sets mute and volume. Getting quieter is applied at once; becoming audible
  // or louder fades in over VOLUME_FADE_MS.
  function applyVolume(tile, shouldMute) {
    const video = tile.video;
    if (shouldMute) {
      tile.fade = null;
      if (!video.muted) video.muted = true;
      return;
    }

    const target = targetVolume(tile);
    if (video.muted) {
      video.volume = 0;
      video.muted = false;
      startFade(tile, 0, target);
      return;
    }
    if (tile.fade) {
      if (tile.fade.to !== target) startFade(tile, video.volume, target);
      return;
    }
    if (Math.abs(video.volume - target) < 0.01) return;
    if (target < video.volume) video.volume = target;
    else startFade(tile, video.volume, target);
  }

  function startFade(tile, from, to) {
    const fade = { from, to, start: performance.now() };
    tile.fade = fade;
    const step = (now) => {
      if (tile.fade !== fade || !tile.video?.isConnected) return;
      const t = Math.min((now - fade.start) / VOLUME_FADE_MS, 1);
      tile.video.volume = from + (to - from) * t;
      if (t < 1) requestAnimationFrame(step);
      else tile.fade = null;
    };
    requestAnimationFrame(step);
  }

  function allPaused() {
    return state.tiles.length > 0 && state.tiles.every((t) => t.paused);
  }

  function setTilePaused(tile, paused) {
    tile.paused = paused;
    applyTileState(tile);
    render();
  }

  function seekBy(tile, seconds) {
    const video = tile.video;
    if (!video || tile.isAd) return;
    const end = Number.isFinite(video.duration) ? video.duration : Infinity;
    video.currentTime = Math.min(Math.max(video.currentTime + seconds, 0), end);
    updateControls(tile);
  }

  // Uses the player's own "next" button, which goes to the video YouTube
  // would autoplay next. The button is hidden by FRAME_CSS but still works.
  function skipToNext(tile) {
    if (tile.errored) return;
    if (tile.isAd) {
      showToast("広告の再生中はスキップできません");
      return;
    }
    const nextBtn = getFrameDocument(tile)?.querySelector("#movie_player .ytp-next-button");
    if (!nextBtn || nextBtn.getAttribute("aria-disabled") === "true") {
      showToast("次の動画が見つかりません");
      return;
    }
    tile.paused = false;
    nextBtn.click();
    render();
  }

  function runControl(tile, action) {
    if (action === "toggle") setTilePaused(tile, !tile.paused);
    else if (action === "rewind") seekBy(tile, -SEEK_SECONDS);
    else if (action === "forward") seekBy(tile, SEEK_SECONDS);
    else if (action === "next") skipToNext(tile);
  }

  function formatTime(seconds) {
    const total = Math.max(Math.floor(seconds), 0);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
  }

  function updateControls(tile) {
    if (state.zoomedId !== tile.videoId) return;
    const video = tile.video;
    const controls = tile.controls;
    controls.classList.toggle("is-disabled", !video || tile.isAd);

    const toggle = controls.querySelector('[data-action="toggle"]');
    const icon = tile.paused ? ICONS.play : ICONS.pause;
    if (toggle.innerHTML !== icon) toggle.innerHTML = icon;
    toggle.title = tile.paused ? "再生 (K)" : "一時停止 (K)";
    if (!video) return;

    const live = !Number.isFinite(video.duration);
    tile.seek.disabled = live || tile.isAd;
    if (!tile.seeking && !live && video.duration > 0) {
      tile.seek.value = String(Math.round((video.currentTime / video.duration) * 1000));
    }
    controls.querySelector(".zap-stack-time").textContent = live
      ? "LIVE"
      : `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
  }

  function blockAudio() {
    if (state.audioBlocked) return;
    state.audioBlocked = true;
    showToast("クリックすると音が出ます");
  }

  // Runs inside a user interaction, which is what Chrome requires before
  // allowing playback with sound.
  function unlockAudio() {
    if (!state.audioBlocked) return;
    state.audioBlocked = false;
    for (const tile of state.tiles) applyTileState(tile);
  }

  document.addEventListener("pointerdown", unlockAudio, true);
  document.addEventListener("keydown", unlockAudio, true);

  // Pause the video on the page itself so its audio does not overlap with the
  // zoomed tile. Tile videos live inside iframes and are not matched here.
  function pauseHostVideo() {
    const hostVideo = document.querySelector("#movie_player video");
    if (hostVideo && !hostVideo.paused) hostVideo.pause();
  }

  // Called synchronously from a click so that unmuting happens within the
  // user activation (which also propagates to same-origin child frames).
  function zoom(videoId) {
    const target = findTile(videoId);
    if (!target || target.errored) return;
    if (!target.video) {
      showToast("読み込み中です");
      return;
    }
    if (target.isAd) {
      showToast("広告の再生中はズームできません");
      return;
    }
    // Zooming in means "watch this one now", so resume it if it was paused.
    target.paused = false;
    state.zoomedId = videoId;
    pauseHostVideo();
    for (const tile of state.tiles) applyTileState(tile);
    render();
  }

  function unzoom() {
    if (state.zoomedId === null) return;
    state.zoomedId = null;
    for (const tile of state.tiles) applyTileState(tile);
    render();
  }

  function setRate(rate) {
    state.rate = rate;
    for (const tile of state.tiles) applyTileState(tile);
    render();
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (state.zoomedId !== null) {
      unzoom();
    } else if (state.maximized) {
      state.maximized = false;
      render();
    }
  });

  function isEditable(el) {
    return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  }

  // While zoomed, YouTube-style shortcuts control the zoomed tile. Registered
  // on window in the capture phase so the page's own player does not react.
  window.addEventListener(
    "keydown",
    (e) => {
      const tile = state.zoomedId === null ? null : findTile(state.zoomedId);
      if (!tile || e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target)) return;
      if (e.target instanceof HTMLInputElement && e.target.type === "range") return;

      const key = e.key.toLowerCase();
      let handled = true;
      if (key === " " || key === "k") setTilePaused(tile, !tile.paused);
      else if (key === "j") seekBy(tile, -SEEK_SECONDS);
      else if (key === "l") seekBy(tile, SEEK_SECONDS);
      else if (key === "arrowleft") seekBy(tile, -SEEK_SECONDS_SHORT);
      else if (key === "arrowright") seekBy(tile, SEEK_SECONDS_SHORT);
      else if (key === "n" && e.shiftKey) skipToNext(tile);
      else handled = false;

      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true
  );

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  function columnsFor(count) {
    return count <= 1 ? 1 : 2;
  }

  function render() {
    updateSyncLoop();

    const count = state.tiles.length;
    if (count === 0) {
      state.collapsed = false;
      state.maximized = false;
    }
    panel.hidden = count === 0 && !state.dropActive;
    panel.classList.toggle("is-empty", count === 0);
    panel.classList.toggle("is-drop-target", state.dropActive);

    const zoomed = state.zoomedId !== null;
    panel.classList.toggle("is-zoomed", zoomed);
    panel.classList.toggle("is-collapsed", state.collapsed);
    panel.classList.toggle("is-maximized", state.maximized);
    applyPanelWidth();
    applyPosition();
    countEl.textContent = `${count}/${MAX_TILES}`;
    backBtn.hidden = !zoomed;
    collapseBtn.textContent = state.collapsed ? "＋" : "－";
    collapseBtn.title = state.collapsed ? "展開する" : "折りたたむ";
    maximizeBtn.textContent = state.maximized ? "❐" : "□";
    maximizeBtn.title = state.maximized ? "元の大きさに戻す (Esc)" : "最大化";

    const paused = allPaused();
    playAllBtn.innerHTML = paused ? ICONS.play : ICONS.pause;
    playAllBtn.title = paused ? "すべて再生" : "すべて一時停止";

    for (const btn of ratesEl.children) {
      btn.classList.toggle("is-active", Number(btn.dataset.rate) === state.rate);
    }

    // While zoomed, the zoomed tile spans the full width and the others line
    // up in a single row below it.
    const cols = zoomed ? Math.max(count - 1, 1) : columnsFor(count);
    grid.style.setProperty("--zap-cols", String(cols));
    // Used only while maximized, where tiles share the viewport height.
    grid.style.gridTemplateRows = !state.maximized
      ? ""
      : zoomed && count > 1
        ? "minmax(0, 1fr) minmax(0, 22%)"
        : `repeat(${Math.ceil(count / cols)}, minmax(0, 1fr))`;

    for (const tile of state.tiles) {
      const isZoomed = tile.videoId === state.zoomedId;
      tile.el.classList.toggle("is-zoomed", isZoomed);
      tile.el.classList.toggle("is-background", zoomed && !isZoomed);
      tile.el.classList.toggle("is-user-paused", tile.paused);
      updateControls(tile);
      tile.el.querySelector(".zap-stack-catcher").title = isZoomed
        ? "クリックでグリッドに戻る"
        : "クリックでズーム";
    }
  }

  let toastTimer = null;
  function showToast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, 2000);
  }

  function flash(el) {
    el.classList.remove("is-flash");
    void el.offsetWidth;
    el.classList.add("is-flash");
  }

  // ---------------------------------------------------------------------------
  // Dragging
  // ---------------------------------------------------------------------------

  // Each axis is either pinned to a viewport edge ("left"/"right",
  // "top"/"bottom") or floating ("center"). A pinned axis keeps its edge in
  // place and grows away from it when the panel gets bigger (zoom, adding
  // tiles); a floating axis grows evenly around the panel's center.
  // Offsets: distance from the pinned edge, or the center coordinate.
  const SNAP_DISTANCE = 48;
  const position = { h: "left", v: "bottom", x: 16, y: 16 };

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  const MAXIMIZED_MARGIN = 16;

  function applyPosition() {
    if (state.maximized) {
      for (const side of ["left", "right", "top", "bottom"]) {
        panel.style[side] = `${MAXIMIZED_MARGIN}px`;
      }
      return;
    }
    const rect = panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left;
    if (position.h === "left") left = position.x;
    else if (position.h === "right") left = vw - rect.width - position.x;
    else left = position.x - rect.width / 2;
    let top;
    if (position.v === "top") top = position.y;
    else if (position.v === "bottom") top = vh - rect.height - position.y;
    else top = position.y - rect.height / 2;

    left = clamp(left, 0, vw - rect.width);
    top = clamp(top, 0, vh - rect.height);

    // Use the pinned edge as the CSS anchor so that the browser keeps it in
    // place during size changes before this function runs again.
    panel.style.left = position.h === "right" ? "auto" : `${left}px`;
    panel.style.right = position.h === "right" ? `${vw - left - rect.width}px` : "auto";
    panel.style.top = position.v === "bottom" ? "auto" : `${top}px`;
    panel.style.bottom = position.v === "bottom" ? `${vh - top - rect.height}px` : "auto";
  }

  // Derive the pin state from where the panel currently is.
  function updatePinFromRect(rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const toLeft = rect.left;
    const toRight = vw - rect.right;
    const toTop = rect.top;
    const toBottom = vh - rect.bottom;

    if (Math.min(toLeft, toRight) <= SNAP_DISTANCE) {
      position.h = toLeft <= toRight ? "left" : "right";
      position.x = position.h === "left" ? toLeft : toRight;
    } else {
      position.h = "center";
      position.x = rect.left + rect.width / 2;
    }
    if (Math.min(toTop, toBottom) <= SNAP_DISTANCE) {
      position.v = toTop <= toBottom ? "top" : "bottom";
      position.y = position.v === "top" ? toTop : toBottom;
    } else {
      position.v = "center";
      position.y = rect.top + rect.height / 2;
    }
  }

  // Keep the panel on screen while its size changes (zoom, adding tiles) and
  // when the window is resized.
  new ResizeObserver(applyPosition).observe(panel);
  window.addEventListener("resize", applyPosition);
  applyPosition();

  header.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button") || state.maximized) return;
    const rect = panel.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    panel.classList.add("is-dragging");
    header.setPointerCapture(e.pointerId);

    const onMove = (ev) => {
      const left = clamp(ev.clientX - offsetX, 0, window.innerWidth - rect.width);
      const top = clamp(ev.clientY - offsetY, 0, window.innerHeight - rect.height);
      updatePinFromRect({
        left,
        top,
        right: left + rect.width,
        bottom: top + rect.height,
        width: rect.width,
        height: rect.height,
      });
      applyPosition();
    };
    const onUp = (ev) => {
      header.releasePointerCapture(ev.pointerId);
      header.removeEventListener("pointermove", onMove);
      header.removeEventListener("pointerup", onUp);
      header.removeEventListener("pointercancel", onUp);
      panel.classList.remove("is-dragging");
    };
    header.addEventListener("pointermove", onMove);
    header.addEventListener("pointerup", onUp);
    header.addEventListener("pointercancel", onUp);
  });

  // ---------------------------------------------------------------------------
  // Resizing
  // ---------------------------------------------------------------------------

  // The width is chosen by the user and kept separately for the grid and zoom
  // views, so zooming still enlarges the panel. Height follows from the width
  // because tiles keep a 16:9 ratio.
  const MIN_PANEL_WIDTH = 280;
  const panelWidth = { grid: null, zoomed: null };

  function currentView() {
    return state.zoomedId === null ? "grid" : "zoomed";
  }

  function applyPanelWidth() {
    const width = state.maximized ? null : panelWidth[currentView()];
    panel.style.width = width === null ? "" : `${width}px`;
  }

  for (const handle of resizeHandles) {
    const corner = handle.dataset.corner; // "tl" | "tr" | "bl" | "br"

    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const rect = panel.getBoundingClientRect();
      const fromLeft = corner.endsWith("l");
      const fromTop = corner.startsWith("t");
      const maxWidth = fromLeft ? rect.right : window.innerWidth - rect.left;

      // Keep the corner opposite the handle fixed while resizing.
      position.h = fromLeft ? "right" : "left";
      position.x = fromLeft ? window.innerWidth - rect.right : rect.left;
      position.v = fromTop ? "bottom" : "top";
      position.y = fromTop ? window.innerHeight - rect.bottom : rect.top;
      applyPosition();

      panel.classList.add("is-resizing");
      handle.setPointerCapture(e.pointerId);

      const onMove = (ev) => {
        const delta = (ev.clientX - startX) * (fromLeft ? -1 : 1);
        const width = clamp(rect.width + delta, MIN_PANEL_WIDTH, maxWidth);
        panelWidth[currentView()] = Math.round(width);
        applyPanelWidth();
      };
      const onUp = (ev) => {
        handle.releasePointerCapture(ev.pointerId);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        panel.classList.remove("is-resizing");
        // Re-evaluate edges/center for the new size and place.
        updatePinFromRect(panel.getBoundingClientRect());
        applyPosition();
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    });

    // Double-click resets the current view to its default width.
    handle.addEventListener("dblclick", () => {
      panelWidth[currentView()] = null;
      applyPanelWidth();
    });
  }

  // ---------------------------------------------------------------------------
  // Drag and drop
  // ---------------------------------------------------------------------------

  // Dragging a video link anywhere on the page shows the panel as a drop
  // target (even with no tiles yet); dropping it on the panel adds a tile.

  function isLinkDrag(e) {
    return e.dataTransfer?.types.includes("text/uri-list") ?? false;
  }

  function setDropActive(active) {
    if (state.dropActive === active) return;
    state.dropActive = active;
    if (active) mountPanel();
    render();
  }

  document.addEventListener("dragstart", (e) => {
    const link = e.target.closest?.("a[href]");
    if (link && zapStackExtractVideoId(link.href)) setDropActive(true);
  });

  // Links dragged in from another window or tab do not fire dragstart here.
  document.addEventListener("dragenter", (e) => {
    if (isLinkDrag(e)) setDropActive(true);
  });

  // Hide the drop target when the drag leaves the window.
  document.addEventListener("dragleave", (e) => {
    const outside =
      e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight;
    if (outside) setDropActive(false);
  });

  document.addEventListener("dragend", () => setDropActive(false));
  document.addEventListener("drop", () => setDropActive(false));

  panel.addEventListener("dragover", (e) => {
    if (!isLinkDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    panel.classList.add("is-drop-hover");
  });

  panel.addEventListener("dragleave", (e) => {
    if (!panel.contains(e.relatedTarget)) panel.classList.remove("is-drop-hover");
  });

  panel.addEventListener("drop", (e) => {
    e.preventDefault();
    panel.classList.remove("is-drop-hover");
    const uriList = e.dataTransfer.getData("text/uri-list");
    const url = uriList.split(/\r?\n/).find((line) => line && !line.startsWith("#"))
      ?? e.dataTransfer.getData("text/plain");
    const videoId = zapStackExtractVideoId(url);
    if (videoId) addTile(videoId);
    else showToast("YouTube の動画リンクではありません");
  });

  // ---------------------------------------------------------------------------
  // Messages from the background service worker
  // ---------------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "zap-stack:add" && typeof message.videoId === "string") {
      addTile(message.videoId);
    }
  });
})();
