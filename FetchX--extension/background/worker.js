console.log("WORKER LOADED");

const BACKEND_URL = "http://localhost:3000";

const UNSPLASH_MAX_PAGES = 125;
const UNSPLASH_PER_PAGE = 30;
const PIXABAY_MAX_ITEMS = 500;

let currentJob = null;

/* helpers */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeMediaType(mediaType) {
  const t = mediaType?.toLowerCase();
  if (["image", "images", "photos"].includes(t)) return "images";
  if (["video", "videos"].includes(t)) return "videos";
  if (t === "illustrations") return "illustrations";
  if (t === "vectors") return "vectors";
  return null;
}

function resolveRoute(provider, mediaType) {
  if (provider === "pexels") return mediaType;
  if (provider === "unsplash" && mediaType === "images") return "images";
  if (provider === "pixabay") {
    if (mediaType === "videos") return "videos";
    return "photos";
  }
  return null;
}

async function fetchMetadata({ provider, route, query, page, perPage }) {
  const res = await fetch(
    `${BACKEND_URL}/metadata/${provider}/${route}?query=${encodeURIComponent(
      query
    )}&page=${page}&perPage=${perPage}`
  );
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

function emitProgress(providers, downloaded, target) {
  chrome.runtime.sendMessage({
    type: "PROGRESS",
    downloaded,
    target,
    providers: Object.fromEntries(
      providers.map((p) => [
        p.name,
        {
          downloaded: p.downloaded,
          remaining: p.remaining,
        },
      ])
    ),
  });
}

/* execution */
async function runJob() {
  const mediaType = normalizeMediaType(currentJob.mediaType);

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

  let downloaded = 0;

  while (downloaded < currentJob.targetCount) {
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
        data = await fetchMetadata({
          provider: p.name,
          route,
          query: currentJob.query,
          page: p.page,
          perPage: p.perPage,
        });
      } catch {
        p.enabled = false;
        continue;
      }

      if (!data.items?.length) {
        p.enabled = false;
        continue;
      }

      active = true;

      for (const _ of data.items) {
        if (downloaded >= currentJob.targetCount || p.remaining <= 0) break;

        downloaded++;
        p.downloaded++;
        p.remaining--;

        emitProgress(providers, downloaded, currentJob.targetCount);
        await sleep(6);
      }

      p.page++;
      await sleep(120);
    }

    if (!active) break;
  }

  chrome.runtime.sendMessage({ type: "DONE" });
}

/* messaging */
chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  if (msg.type === "CREATE_JOB") {
    currentJob = msg;
    sendResponse({ ok: true });
    runJob();
    return true;
  }
});
