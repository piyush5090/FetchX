console.log("FETCHX WORKER LOADED");

//const BACKEND_URL = "http://localhost:3000";
const BACKEND_URL = "https://fetchx-backend.onrender.com";

/* ---------- LIMITS ---------- */
const UNSPLASH_MAX_PAGES = 125;
const UNSPLASH_PER_PAGE = 30;
const PIXABAY_MAX_ITEMS = 500;

/* ---------- STATE ---------- */
let currentJob = null;
let cancelled = false;

/* ---------- HELPERS ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeMediaType(type) {
  if (["images", "image", "photos"].includes(type)) return "images";
  if (["videos", "video"].includes(type)) return "videos";
  return null;
}

function resolveRoute(provider, mediaType) {
  if (provider === "pexels") return mediaType;
  if (provider === "unsplash" && mediaType === "images") return "images";
  if (provider === "pixabay") return mediaType === "videos" ? "videos" : "photos";
  return null;
}

function extractUrl(provider, item) {
  if (provider === "pexels") {
    return item.src?.original || item.video_files?.[0]?.link;
  }
  if (provider === "unsplash") {
    return item.urls?.full;
  }
  if (provider === "pixabay") {
    return item.largeImageURL || item.videos?.large?.url;
  }
  return null;
}

function buildFilename(query, provider, item, mediaType) {
  const ext = mediaType === "videos" ? "mp4" : "jpg";
  return `${query}/${provider}/${provider}_${item.id}.${ext}`;
}

/* ---------- SAFE DOWNLOAD (NO FREEZE) ---------- */
function downloadFileSequential(url, filename, retries = 2) {
  return new Promise((resolve) => {
    const attempt = (left) => {
      let finished = false;

      chrome.downloads.download(
        {
          url,
          filename,
          saveAs: false,
          conflictAction: "uniquify",
        },
        (downloadId) => {
          if (!downloadId) {
            if (left > 0) return attempt(left - 1);
            return resolve(false);
          }

          const timeout = setTimeout(() => {
            if (!finished) {
              finished = true;
              chrome.downloads.onChanged.removeListener(listener);
              resolve(true); // assume success
            }
          }, 8000); // ⏱️ HARD SAFETY TIMEOUT

          const listener = (delta) => {
            if (delta.id !== downloadId) return;

            if (delta.state?.current === "complete") {
              clearTimeout(timeout);
              finished = true;
              chrome.downloads.onChanged.removeListener(listener);
              resolve(true);
            }

            if (delta.state?.current === "interrupted") {
              clearTimeout(timeout);
              chrome.downloads.onChanged.removeListener(listener);
              if (left > 0) return attempt(left - 1);
              resolve(false);
            }
          };

          chrome.downloads.onChanged.addListener(listener);
        }
      );
    };

    attempt(retries);
  });
}

/* ---------- BACKEND METADATA ---------- */
async function fetchMetadata(provider, route, query, page, perPage) {
  const res = await fetch(
    `${BACKEND_URL}/metadata/${provider}/${route}?query=${encodeURIComponent(
      query
    )}&page=${page}&perPage=${perPage}`
  );
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

/* ---------- PROGRESS ---------- */
function emitProgress(providers, total, target) {
  chrome.runtime.sendMessage({
    type: "PROGRESS",
    downloaded: total,
    target,
    providers: Object.fromEntries(
      providers.map((p) => [
        p.name,
        { downloaded: p.downloaded, remaining: p.remaining },
      ])
    ),
  });
}

/* ---------- MAIN EXECUTION ---------- */
async function runJob() {
  cancelled = false;

  const mediaType = normalizeMediaType(currentJob.mediaType);
  const query = currentJob.query;
  const target = currentJob.targetCount;

  const providers = [
    {
      name: "pexels",
      enabled: true,
      page: 1,
      perPage: mediaType === "videos" ? 30 : 80,
      remaining: Infinity,
      downloaded: 0,
    },
    {
      name: "unsplash",
      enabled: mediaType === "images",
      page: 1,
      perPage: UNSPLASH_PER_PAGE,
      remaining: UNSPLASH_MAX_PAGES * UNSPLASH_PER_PAGE,
      downloaded: 0,
    },
    {
      name: "pixabay",
      enabled: true,
      page: 1,
      perPage: mediaType === "videos" ? 50 : 80,
      remaining: PIXABAY_MAX_ITEMS,
      downloaded: 0,
    },
  ];

  let totalDownloaded = 0;

  while (totalDownloaded < target && !cancelled) {
    let active = false;

    for (const p of providers) {
      if (!p.enabled || p.remaining <= 0) continue;

      const route = resolveRoute(p.name, mediaType);
      if (!route) {
        p.enabled = false;
        continue;
      }

      if (p.name === "unsplash" && p.page > UNSPLASH_MAX_PAGES) {
        p.enabled = false;
        continue;
      }

      let data;
      try {
        data = await fetchMetadata(
          p.name,
          route,
          query,
          p.page,
          p.perPage
        );
      } catch {
        p.enabled = false;
        continue;
      }

      if (!data.items?.length) {
        p.enabled = false;
        continue;
      }

      active = true;

      for (const item of data.items) {
        if (totalDownloaded >= target || p.remaining <= 0 || cancelled) break;

        const url = extractUrl(p.name, item);
        if (!url) continue;

        const filename = buildFilename(query, p.name, item, mediaType);

        const success = await downloadFileSequential(url, filename);

        if (success) {
          totalDownloaded++;
          p.downloaded++;
          p.remaining--;
          emitProgress(providers, totalDownloaded, target);
        }

        await sleep(150); // ✅ prevents Chrome throttling
      }

      p.page++;
      await sleep(300);
    }

    if (!active) break;
  }

  chrome.runtime.sendMessage({ type: "DONE" });
}

/* ---------- MESSAGING ---------- */
chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  if (msg.type === "CREATE_JOB") {
    currentJob = msg;
    runJob();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "CANCEL_JOB") {
    cancelled = true;
    sendResponse({ ok: true });
    return true;
  }
});
