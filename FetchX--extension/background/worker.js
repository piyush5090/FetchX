console.log("FETCHX WORKER LOADED (BULLDOZER MODE) Gem");

const BACKEND_URL = "https://fetchx-backend-fucw.onrender.com";

/* ================= CONSTANTS ================= */
const STORAGE_KEY = "fetchxJob";
const MAX_RETRIES = 2; // Reduced to keep speed up

const UNSPLASH_MAX_PAGES = 125;
const UNSPLASH_PER_PAGE = 30;
const PIXABAY_MAX_ITEMS = 500;

const PROVIDER_ORDER = ["pexels", "unsplash", "pixabay"];
const LOOP_YIELD_MS = 200; // Faster yield

/* ================= STATE ================= */
let state = null;
let isRunning = false;
let stopRequested = false;

/* ================= HELPERS ================= */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ================= STORAGE ================= */
async function saveState() {
  if (!state) return;
  // Saving every single item can be slow, we save less frequently or on important changes
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

/* ================= MEDIA ================= */
function normalizeType(type) {
  return type === "videos" ? "videos" : "images";
}

function resolveRoute(provider, mediaType) {
  if (provider === "pexels") return mediaType;
  if (provider === "pixabay")
    return mediaType === "videos" ? "videos" : "photos";
  if (provider === "unsplash") return "images";
}

/* ================= CAPABILITY ================= */
function providerSupportsMedia(provider, mediaType) {
  if (provider === "unsplash") return mediaType === "images";
  return true;
}

/* ================= URL ================= */
function extractUrl(provider, item, mediaType) {
  if (provider === "pexels") {
    return mediaType === "videos"
      ? item.video_files?.[0]?.link
      : item.src?.original;
  }
  if (provider === "unsplash") return item.urls?.full;
  if (provider === "pixabay") {
    return mediaType === "videos"
      ? item.videos?.large?.url
      : item.largeImageURL;
  }
  return null;
}

function buildFilename(query, provider, item, mediaType) {
  const ext = mediaType === "videos" ? "mp4" : "jpg";
  // sanitize query for filename
  const safeQuery = query.replace(/[^a-z0-9]/gi, '_');
  return `${safeQuery}/${provider}/${provider}_${item.id}.${ext}`;
}

/* ================= DOWNLOAD (AGGRESSIVE TIMEOUT) ================= */
function downloadOnce(url, filename) {
  return new Promise((resolve) => {
    let finished = false;

    chrome.downloads.download(
      { url, filename, saveAs: false, conflictAction: "uniquify" },
      (id) => {
        if (chrome.runtime.lastError || !id) {
          // If URL is bad, just fail immediately so we can skip
          return resolve(false);
        }

        // --- THE "BOMB": Force success after 12s to prevent freezing ---
        const timeout = setTimeout(() => {
          if (!finished) {
            finished = true;
            chrome.downloads.onChanged.removeListener(listener);
            console.warn(`⚠️ Timeout - Skipping file: ${filename}`);
            resolve(true); // Treat as "done" so the loop continues
          }
        }, 12000); 

        const listener = (d) => {
          if (d.id !== id) return;

          if (d.state?.current === "complete") {
            finished = true;
            clearTimeout(timeout);
            chrome.downloads.onChanged.removeListener(listener);
            resolve(true);
          }
          else if (d.state?.current === "interrupted") {
            finished = true;
            clearTimeout(timeout);
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
    const success = await downloadOnce(url, filename);
    if (success) return true;
    await sleep(500); // short wait before retry
  }
  return false;
}

/* ================= PROGRESS ================= */
function emitProgress() {
  if (!state || state.status !== "running") return;
  chrome.runtime.sendMessage({
    type: "PROGRESS",
    downloaded: state.totalDownloaded,
    target: state.job.targetCount,
    providers: state.providers,
  });
}

/* ================= PROVIDER ROTATION ================= */
function nextProvider() {
  state.providerIndex = (state.providerIndex + 1) % PROVIDER_ORDER.length;
}

/* ================= MAIN LOOP ================= */
async function run() {
  if (isRunning || !state) return;
  isRunning = true;
  stopRequested = false;

  const mediaType = normalizeType(state.job.mediaType);
  let emptyCycles = 0; // Track how many times we found NOTHING

  while (
    state &&
    state.status === "running" &&
    state.totalDownloaded < state.job.targetCount &&
    !stopRequested
  ) {
    let cycleHasActivity = false;

    // Loop through providers
    for (let i = 0; i < PROVIDER_ORDER.length; i++) {
      const providerName = PROVIDER_ORDER[state.providerIndex];
      const p = state.providers[providerName];

      const advance = () => nextProvider();

      // Skip invalid providers
      if (!providerSupportsMedia(providerName, mediaType) || p.exhausted) {
        advance();
        continue;
      }

      // Check limits
      if (providerName === "unsplash" && p.page > UNSPLASH_MAX_PAGES) { p.exhausted = true; advance(); continue; }
      if (providerName === "pixabay" && p.downloaded >= PIXABAY_MAX_ITEMS) { p.exhausted = true; advance(); continue; }

      // Fetch Metadata
      let data;
      try {
        const res = await fetch(
          `${BACKEND_URL}/metadata/${providerName}/${resolveRoute(providerName, mediaType)}?query=${encodeURIComponent(state.job.query)}&page=${p.page}&perPage=${p.perPage}`
        );
        data = await res.json();
      } catch (err) {
        // Network error? Just skip this provider this turn, don't stop.
        console.warn(`Fetch failed for ${providerName}, skipping...`);
        advance();
        continue;
      }

      // Empty page? Mark exhausted
      if (!data.items || data.items.length === 0) {
        p.exhausted = true;
        advance();
        continue;
      }

      // --- DOWNLOAD ITEMS ---
      for (const item of data.items) {
        if (stopRequested || state.status !== "running" || state.totalDownloaded >= state.job.targetCount) break;

        const url = extractUrl(providerName, item, mediaType);
        if (!url) continue;

        const filename = buildFilename(state.job.query, providerName, item, mediaType);
        
        // Attempt download
        const success = await downloadWithRetry(url, filename);

        if (success) {
          state.totalDownloaded++;
          p.downloaded++;
          cycleHasActivity = true; // We did something!
          emitProgress();
        } else {
            // FAILED? Just log and continue. DO NOT PAUSE.
            console.warn(`Skipping failed file: ${filename}`);
        }
        
        await sleep(150); // Anti-throttle sleep
      }

      p.page++; // Always increment page
      advance();
    }

    // Save state after a full cycle
    await saveState();

    // --- SAFETY CHECK (RELAXED) ---
    if (!cycleHasActivity) {
      emptyCycles++;
      console.log(`Cycle empty (${emptyCycles}/5)`);
      if (emptyCycles >= 5) {
        console.warn("⚠ 5 Empty Cycles - Assuming no more content available.");
        break; // Only break after 5 full rounds of nothing
      }
    } else {
      emptyCycles = 0; // Reset if we found something
    }

    await sleep(LOOP_YIELD_MS);
  }

  isRunning = false;
  if (!state) return;

  // Done or Stopped
  if (state.totalDownloaded >= state.job.targetCount || PROVIDER_ORDER.every((n) => state.providers[n].exhausted)) {
    state.status = "done";
    await saveState();
    chrome.runtime.sendMessage({ type: "DONE" });
  } else if (emptyCycles >= 5) {
      // Stopped due to lack of content
      state.status = "done";
      await saveState();
      chrome.runtime.sendMessage({ type: "DONE", reason: "No more content" });
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
        providerIndex: 0,
        providers: {
          pexels: { page: 1, perPage: msg.job.mediaType === "videos" ? 30 : 80, downloaded: 0, exhausted: false },
          unsplash: { page: 1, perPage: UNSPLASH_PER_PAGE, downloaded: 0, exhausted: false },
          pixabay: { page: 1, perPage: msg.job.mediaType === "videos" ? 50 : 80, downloaded: 0, exhausted: false },
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
      chrome.runtime.sendMessage({ type: "PAUSED" });
      sendResponse({ ok: true });
    }

    if (msg.type === "RESUME_JOB") {
      if (!state || state.status !== "paused") return sendResponse({ ok: false });
      state.status = "running";
      stopRequested = false;
      await saveState();
      chrome.runtime.sendMessage({ type: "RUNNING", snapshot: state });
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