console.log("FETCHX WORKER LOADED");

const BACKEND_URL = "https://fetchx-backend.onrender.com";

/* ================= CONSTANTS ================= */
const STORAGE_KEY = "fetchxJob";
const MAX_RETRIES = 3;

const UNSPLASH_MAX_PAGES = 125;
const UNSPLASH_PER_PAGE = 30;
const PIXABAY_MAX_ITEMS = 500;

/* ================= STATE ================= */
let job = null;
let providers = [];
let totalDownloaded = 0;

let stopRequested = false;
let isRunning = false;
let providerIndex = 0;

/* ================= HELPERS ================= */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ================= STORAGE ================= */
async function persistState(reason = null) {
  if (!job) return;

  await chrome.storage.session.set({
    [STORAGE_KEY]: {
      job: structuredClone(job),
      providers: structuredClone(providers),
      totalDownloaded,
      status: stopRequested ? "paused" : "running",
      pauseReason: reason,
      providerIndex,
      savedAt: Date.now(),
    },
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
  chrome.runtime.sendMessage({
    type: "PROGRESS",
    downloaded: totalDownloaded,
    target: job.targetCount,
    providers: Object.fromEntries(
      providers.map((p) => [
        p.name,
        { downloaded: p.downloaded, remaining: p.remaining },
      ])
    ),
  });
}

/* ================= MAIN LOOP ================= */
async function run() {
  if (isRunning || !job) return;

  isRunning = true;
  stopRequested = false;

  const mediaType = normalizeType(job.mediaType);
  await persistState();

  while (totalDownloaded < job.targetCount && !stopRequested) {
    const activeProviders = providers.filter(
      (p) => p.enabled && p.remaining > 0
    );

    if (activeProviders.length === 0) break;

    const p = providers[providerIndex % providers.length];
    providerIndex = (providerIndex + 1) % providers.length;

    if (!p.enabled || p.remaining <= 0) continue;

    // HARD CAPS
    if (p.name === "unsplash" && p.page > UNSPLASH_MAX_PAGES) {
      p.enabled = false;
      continue;
    }

    if (p.name === "pixabay" && p.downloaded >= PIXABAY_MAX_ITEMS) {
      p.enabled = false;
      continue;
    }

    let data;
    try {
      const res = await fetch(
        `${BACKEND_URL}/metadata/${p.name}/${resolveRoute(
          p.name,
          mediaType
        )}?query=${encodeURIComponent(job.query)}&page=${p.page}&perPage=${p.perPage}`
      );
      data = await res.json();
    } catch {
      p.page++;
      continue;
    }

    if (!data.items || data.items.length === 0) {
      p.page++;
      continue;
    }

    for (const item of data.items) {
      if (stopRequested || totalDownloaded >= job.targetCount) break;

      const url = extractUrl(p.name, item);
      if (!url) continue;

      const ok = await downloadWithRetry(
        url,
        buildFilename(job.query, p.name, item, mediaType)
      );

      if (!ok) {
        stopRequested = true;
        await persistState("network-error");
        chrome.runtime.sendMessage({ type: "PAUSED" });
        break;
      }

      totalDownloaded++;
      p.downloaded++;
      p.remaining--;

      emitProgress();
    }

    p.page++;
    await persistState();
    await sleep(200);
  }

  isRunning = false;

  if (stopRequested) return;

  await clearState();
  chrome.runtime.sendMessage({ type: "DONE" });
}

/* ================= MESSAGING ================= */
chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  (async () => {
    if (msg.type === "START_JOB") {
      if (isRunning) return sendResponse({ ok: false });

      job = msg.job;
      totalDownloaded = 0;
      providerIndex = 0;

      const type = normalizeType(job.mediaType);
      providers = [
        { name: "pexels", enabled: true, page: 1, perPage: type === "videos" ? 30 : 80, remaining: Infinity, downloaded: 0 },
        { name: "unsplash", enabled: type === "images", page: 1, perPage: UNSPLASH_PER_PAGE, remaining: UNSPLASH_MAX_PAGES * UNSPLASH_PER_PAGE, downloaded: 0 },
        { name: "pixabay", enabled: true, page: 1, perPage: type === "videos" ? 50 : 80, remaining: PIXABAY_MAX_ITEMS, downloaded: 0 },
      ];

      await persistState();
      run();
      sendResponse({ ok: true });
    }

    if (msg.type === "PAUSE_JOB") {
      if (!isRunning) return sendResponse({ ok: false });
      stopRequested = true;
      await persistState("manual");
      isRunning = false;
      sendResponse({ ok: true });
    }

    if (msg.type === "RESUME_JOB") {
      if (isRunning) return sendResponse({ ok: false });

      const saved = await loadState();
      if (!saved || saved.status !== "paused") {
        return sendResponse({ ok: false });
      }

      ({ job, providers, totalDownloaded, providerIndex } = saved);
      run();
      sendResponse({ ok: true });
    }

    if (msg.type === "STOP_JOB") {
      stopRequested = true;
      isRunning = false;
      await clearState();
      sendResponse({ ok: true });
    }

    if (msg.type === "GET_JOB") {
      const saved = await loadState();
      sendResponse(saved || null);
    }
  })();

  return true;
});
