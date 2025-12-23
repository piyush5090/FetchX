console.log("FETCHX WORKER LOADED");

const BACKEND_URL = "https://fetchx-backend.onrender.com";

/* ================= CONSTANTS ================= */
const STORAGE_KEY = "fetchxJob";
const MAX_RETRIES = 3;

const UNSPLASH_MAX_PAGES = 125;
const UNSPLASH_PER_PAGE = 30;
const PIXABAY_MAX_ITEMS = 500;

/* ================= STATE ================= */
let state = null;
let isRunning = false;
let stopRequested = false;

/* ================= HELPERS ================= */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ================= STORAGE ================= */
async function saveState() {
  if (!state) return;
  await chrome.storage.session.set({
    [STORAGE_KEY]: structuredClone(state),
  });
}

async function loadState() {
  const res = await chrome.storage.session.get(STORAGE_KEY);
  return res[STORAGE_KEY] || null;
}

async function clearState() {
  await chrome.storage.session.remove(STORAGE_KEY);
}

/* ================= NORMALIZATION ================= */
function normalizeType(type) {
  return type === "videos" ? "videos" : "images";
}

function resolveRoute(provider, mediaType) {
  if (provider === "pexels") return mediaType;
  if (provider === "unsplash") return "images";
  if (provider === "pixabay")
    return mediaType === "videos" ? "videos" : "photos";
}

function extractUrl(provider, item) {
  if (provider === "pexels")
    return item.src?.original || item.video_files?.[0]?.link;
  if (provider === "unsplash") return item.urls?.full;
  if (provider === "pixabay")
    return item.largeImageURL || item.videos?.large?.url;
  return null;
}

function buildFilename(query, provider, item, mediaType) {
  const ext = mediaType === "videos" ? "mp4" : "jpg";
  return `${query}/${provider}/${provider}_${item.id}.${ext}`;
}

/* ================= DOWNLOAD ================= */
function downloadOnce(url, filename) {
  return new Promise((resolve) => {
    chrome.downloads.download(
      { url, filename, saveAs: false, conflictAction: "uniquify" },
      (id) => {
        if (!id) return resolve(false);

        const listener = (d) => {
          if (d.id !== id) return;

          if (d.state?.current === "complete") {
            chrome.downloads.onChanged.removeListener(listener);
            resolve(true);
          }

          if (d.state?.current === "interrupted") {
            chrome.downloads.onChanged.removeListener(listener);
            resolve(false);
          }
        };

        chrome.downloads.onChanged.addListener(listener);
      }
    );
  });
}

async function downloadWithRetry(url, filename) {
  for (let i = 1; i <= MAX_RETRIES; i++) {
    if (await downloadOnce(url, filename)) return true;
    await sleep(400 * i);
  }
  return false;
}

/* ================= PROGRESS ================= */
function emitProgress() {
  if (!state) return;
  if (state.status !== "running") return; // 🔥 HARD GUARD

  chrome.runtime.sendMessage(
    {
      type: "PROGRESS",
      downloaded: state.totalDownloaded,
      target: state.job.targetCount,
      providers: state.providers,
    },
    () => {
      if (chrome.runtime.lastError) {}
    }
  );
}

/* ================= MAIN LOOP ================= */
async function run() {
  if (isRunning || !state) return;

  isRunning = true;
  stopRequested = false;

  const mediaType = normalizeType(state.job.mediaType);

  while (
    state &&
    state.status === "running" &&
    state.totalDownloaded < state.job.targetCount &&
    !stopRequested
  ) {
    const providerName = state.currentProvider;
    const p = state.providers[providerName];

    /* Move to next provider if exhausted */
    if (p.exhausted) {
      if (providerName === "unsplash") state.currentProvider = "pixabay";
      else if (providerName === "pixabay") state.currentProvider = "pexels";
      else break;

      await saveState();
      continue;
    }

    /* HARD CAPS */
    if (providerName === "unsplash" && p.page > UNSPLASH_MAX_PAGES) {
      p.exhausted = true;
      await saveState();
      continue;
    }

    if (providerName === "pixabay" && p.downloaded >= PIXABAY_MAX_ITEMS) {
      p.exhausted = true;
      await saveState();
      continue;
    }

    let data;
    try {
      const res = await fetch(
        `${BACKEND_URL}/metadata/${providerName}/${resolveRoute(
          providerName,
          mediaType
        )}?query=${encodeURIComponent(state.job.query)}&page=${p.page}&perPage=${p.perPage}`
      );
      data = await res.json();
    } catch {
      p.page++;
      await saveState();
      continue;
    }

    if (!data.items || data.items.length === 0) {
      p.exhausted = true;
      await saveState();
      continue;
    }

    for (const item of data.items) {
      if (
        stopRequested ||
        !state ||
        state.status !== "running" ||
        state.totalDownloaded >= state.job.targetCount
      ) {
        break;
      }

      const url = extractUrl(providerName, item);
      if (!url) continue;

      const ok = await downloadWithRetry(
        url,
        buildFilename(state.job.query, providerName, item, mediaType)
      );

      if (!ok) {
        state.status = "paused";
        await saveState();
        chrome.runtime.sendMessage({ type: "PAUSED" });
        isRunning = false;
        return;
      }

      /* SUCCESS */
      state.totalDownloaded++;
      p.downloaded++;

      emitProgress();
      await saveState(); // 🔥 CRITICAL
    }

    p.page++;
    await saveState();
    await sleep(200);
  }

  isRunning = false;

  if (!state) return;

  if (state.totalDownloaded >= state.job.targetCount) {
    state.status = "done";
    await saveState();
    chrome.runtime.sendMessage({ type: "DONE" });
  }
}

/* ================= MESSAGING ================= */
chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  (async () => {
    if (msg.type === "START_JOB") {
      state = {
        status: "running",
        job: msg.job,
        totalDownloaded: 0,
        currentProvider: "unsplash",
        providers: {
          unsplash: {
            page: 1,
            perPage: UNSPLASH_PER_PAGE,
            downloaded: 0,
            exhausted: false,
          },
          pixabay: {
            page: 1,
            perPage:
              msg.job.mediaType === "videos" ? 50 : 80,
            downloaded: 0,
            exhausted: false,
          },
          pexels: {
            page: 1,
            perPage:
              msg.job.mediaType === "videos" ? 30 : 80,
            downloaded: 0,
            exhausted: false,
          },
        },
      };

      await saveState();
      run();
      sendResponse({ ok: true });
    }

    if (msg.type === "PAUSE_JOB") {
  if (!state) return sendResponse({ ok: false });

  state.status = "paused";
  stopRequested = true;
  await saveState();

  chrome.runtime.sendMessage({
    type: "PAUSED",
    snapshot: state
  });

  sendResponse({ ok: true });
}


    if (msg.type === "RESUME_JOB") {
      if (!state || state.status !== "paused")
        return sendResponse({ ok: false });

      state.status = "running";
      stopRequested = false;
      await saveState();

      chrome.runtime.sendMessage({
        type: "RUNNING",
        snapshot: state
      });

      run();
      sendResponse({ ok: true });
    }

    if (msg.type === "STOP_JOB") {
      stopRequested = true;
      await clearState();
      state = null;
      sendResponse({ ok: true });
    }

    if (msg.type === "GET_JOB") {
      const saved = await loadState();
      sendResponse(saved || null);
    }
  })();

  return true;
});
