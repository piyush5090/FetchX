import { saveJob, loadJob, clearJob } from "./db.js";

const BACKEND_URL = "https://fetchx-backend.onrender.com";

console.log("FetchX background worker started");

let currentJob = null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPage(query, page, perPage) {
  const url = `${BACKEND_URL}/metadata/pexels/images?query=${encodeURIComponent(
    query
  )}&page=${page}&perPage=${perPage}`;

  const res = await fetch(url);

  if (res.status === 404) {
    return { items: [] };
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
}

async function runMetadataLoop() {
  console.log("Metadata loop started");

  while (true) {
    try {
    console.log(`[FetchX] Fetching page ${currentJob.page}`);
      const data = await fetchPage(
        currentJob.query,
        currentJob.page,
        currentJob.perPage
      );

      if (!data.items || data.items.length === 0) {
        console.log("Metadata complete");
        await clearJob();

        chrome.runtime.sendMessage({
          type: "METADATA_DONE",
          payload: { totalFetched: currentJob.totalFetched },
        });

        return;
      }

      currentJob.page += 1;
      currentJob.totalFetched += data.items.length;

      await saveJob(currentJob);

      chrome.runtime.sendMessage({
        type: "METADATA_PROGRESS",
        payload: {
          page: currentJob.page,
          totalFetched: currentJob.totalFetched,
        },
      });

      await sleep(400);
    } catch (err) {
      console.warn("Worker paused:", err.message);

      currentJob.status = "paused";
      await saveJob(currentJob);

      chrome.runtime.sendMessage({
        type: "METADATA_PAUSED",
        payload: {
          page: currentJob.page,
          totalFetched: currentJob.totalFetched,
        },
      });

      return;
    }
  }
}

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.type === "START_SEARCH") {
    currentJob = {
      status: "metadata",
      query: msg.query,
      mediaType: msg.mediaType,
      page: 1,
      perPage: 80,
      totalFetched: 0,
    };

    await saveJob(currentJob);
    sendResponse({ ok: true });
  }

  if (msg.type === "START_METADATA") {
    const saved = await loadJob();
    if (saved) currentJob = saved;

    runMetadataLoop();
    sendResponse({ ok: true });
  }

  if (msg.type === "RESET_JOB") {
    await clearJob();
    currentJob = null;
    sendResponse({ ok: true });
  }

  return true;
});
