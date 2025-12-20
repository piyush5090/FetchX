const BACKEND_URL = "https://fetchx-backend.onrender.com";

console.log("FetchX background worker started");

let currentJob = {
  status: "idle",
  query: null,
  mediaType: "images",
  page: 1,
  perPage: 80,
  totalFetched: 0,
  metadata: [],
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPexelsImagesPage(query, page, perPage, attempt = 1) {
  const url = `${BACKEND_URL}/metadata/pexels/images?query=${encodeURIComponent(
    query
  )}&page=${page}&perPage=${perPage}`;

  try {
    const res = await fetch(url);

    if (!res.ok) {
      console.warn(
        `Metadata fetch failed (status ${res.status}) on page ${page}, attempt ${attempt}`
      );

      // Retry up to 3 times
      if (attempt < 3) {
        await sleep(2000);
        return fetchPexelsImagesPage(query, page, perPage, attempt + 1);
      }

      throw new Error(`Failed after retries (status ${res.status})`);
    }

    return res.json();
  } catch (err) {
    console.error("Fetch error:", err.message);

    if (attempt < 3) {
      await sleep(2000);
      return fetchPexelsImagesPage(query, page, perPage, attempt + 1);
    }

    throw err;
  }
}

function sendProgress() {
  chrome.runtime.sendMessage({
    type: "METADATA_PROGRESS",
    payload: {
      page: currentJob.page,
      totalFetched: currentJob.totalFetched,
    },
  });
}

async function startMetadataLoop() {
  console.log("Starting metadata pagination loop");

  currentJob.status = "metadata";
  currentJob.page = 1;
  currentJob.totalFetched = 0;
  currentJob.metadata = [];

  while (true) {
    console.log(`Fetching page ${currentJob.page}`);

    const data = await fetchPexelsImagesPage(
      currentJob.query,
      currentJob.page,
      currentJob.perPage
    );

    const items = data.items || [];

    if (items.length === 0) {
      console.log("No more metadata. Loop finished.");
      break;
    }

    currentJob.metadata.push(...items);
    currentJob.totalFetched += items.length;

    sendProgress();

    currentJob.page += 1;

    // 🔹 IMPORTANT: throttle to protect Render
    await sleep(500);
  }

  currentJob.status = "idle";

  chrome.runtime.sendMessage({
    type: "METADATA_DONE",
    payload: {
      totalFetched: currentJob.totalFetched,
    },
  });

  console.log("Metadata loop complete");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "PING":
      sendResponse({ ok: true, status: currentJob.status });
      break;

    case "START_SEARCH":
      currentJob.query = message.query;
      currentJob.mediaType = message.mediaType;
      sendResponse({ ok: true });
      break;

    case "START_METADATA":
      if (currentJob.mediaType !== "images") {
        sendResponse({ ok: false, error: "Only images supported" });
        break;
      }

      startMetadataLoop().catch((err) => {
        console.error("Metadata loop fatal error:", err);
      });

      sendResponse({ ok: true });
      break;

    default:
      sendResponse({ ok: false });
  }

  return true;
});
