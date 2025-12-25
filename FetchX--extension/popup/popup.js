console.log("POPUP LOADED");

const BACKEND_URL = "https://fetchx-backend-fucw.onrender.com";

/* ===== DOM ===== */
let currentStatus = "idle";

const queryInput = document.getElementById("queryInput");
const searchBtn = document.getElementById("searchBtn");
const mediaTypeSelect = document.getElementById("mediaTypeSelect");

const resultsSection = document.getElementById("resultsSection");
const providerResults = document.getElementById("providerResults");
const maxLimitEl = document.getElementById("maxLimit");

const countInput = document.getElementById("countInput");
const downloadBtn = document.getElementById("downloadBtn");

const progressSection = document.getElementById("progressSection");
const progressTotal = document.getElementById("progressTotal");
const progressProviders = document.getElementById("progressProviders");

const controlSection = document.getElementById("controlSection");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn = document.getElementById("stopBtn");

const statusText = document.getElementById("statusText");

/* ===== UI HELPERS ===== */
function showIdleUI() {
  progressSection.classList.add("hidden");
  controlSection.classList.add("hidden");
  statusText.textContent = "Status: Idle";
}

function renderRunning(snapshot) {
  progressSection.classList.remove("hidden");
  controlSection.classList.remove("hidden");
  pauseBtn.textContent = "Pause";
  statusText.textContent = "Status: Downloading...";
  renderProgress(snapshot);
}

function renderPaused(snapshot) {
  progressSection.classList.remove("hidden");
  controlSection.classList.remove("hidden");
  pauseBtn.textContent = "Resume";
  statusText.textContent =
    snapshot.pauseReason === "network-error"
      ? "Status: Paused (Network error)"
      : "Status: Paused";
  renderProgress(snapshot);
}

function renderProgress(snapshot) {
  progressTotal.textContent =
    `Total: ${snapshot.totalDownloaded}/${snapshot.job.targetCount}`;

  progressProviders.innerHTML = "";

  Object.entries(snapshot.providers).forEach(([name, p]) => {
    const div = document.createElement("div");
    div.textContent =
      `${name}: ${p.downloaded} downloaded`;
    progressProviders.appendChild(div);
  });
}


/* ===== INIT ===== */
chrome.runtime.sendMessage({ type: "GET_JOB" }, (snapshot) => {
  if (!snapshot || !snapshot.job) {
    showIdleUI();
    return;
  }

  if (snapshot.status === "paused") {
    renderPaused(snapshot);
  } else {
    renderRunning(snapshot);
  }
});

/* ===== SEARCH ===== */
async function handleSearch() {
  const query = queryInput.value.trim();
  const type = mediaTypeSelect.value;
  if (!query) return;

  statusText.textContent = "Status: Searching...";
  searchBtn.disabled = true;
  providerResults.innerHTML = "";
  resultsSection.classList.add("hidden");

  try {
    const res = await fetch(
      `${BACKEND_URL}/search?query=${encodeURIComponent(query)}&type=${type}`
    );
    const data = await res.json();

    maxLimitEl.textContent = data.maxDownloadLimit;
    providerResults.innerHTML = "";

    Object.entries(data.providers).forEach(([name, info]) => {
      const row = document.createElement("div");
      row.className = "provider-row";
      row.innerHTML = `<span>${name}</span><span>${info.usable}</span>`;
      providerResults.appendChild(row);
    });

    resultsSection.classList.remove("hidden");
    statusText.textContent = "Status: Ready";
  } catch {
    statusText.textContent = "Status: Search failed";
  } finally {
    searchBtn.disabled = false;
  }
}

/* ===== COUNT ===== */
countInput.addEventListener("input", () => {
  const v = Number(countInput.value);
  downloadBtn.disabled = !(v > 0);
});

/* ===== START ===== */
downloadBtn.addEventListener("click", () => {
  const job = {
    query: queryInput.value.trim(),
    mediaType: mediaTypeSelect.value,
    targetCount: Number(countInput.value),
  };

  chrome.runtime.sendMessage({ type: "START_JOB", job }, (res) => {
    if (res?.ok) {
      statusText.textContent = "Status: Downloading...";
      pauseBtn.textContent = "Pause";
      controlSection.classList.remove("hidden");
      progressSection.classList.remove("hidden");
    }
  });
});

/* ===== PAUSE / RESUME ===== */
pauseBtn.addEventListener("click", () => {
  if (pauseBtn.textContent === "Pause") {
    chrome.runtime.sendMessage({ type: "PAUSE_JOB" });
  } else {
    chrome.runtime.sendMessage({ type: "RESUME_JOB" });
  }
});

/* ===== STOP ===== */
stopBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "STOP_JOB" }, () => {
    showIdleUI();
  });
});

/* ===== LIVE UPDATES ===== */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "RUNNING") {
    renderRunning(msg.snapshot);
  }

  if (msg.type === "PROGRESS") {
  // 🔥 DO NOTHING if paused
  if (currentStatus === "paused") return;

  currentStatus = "running";

  pauseBtn.textContent = "Pause";
  statusText.textContent = "Status: Downloading...";

  progressTotal.textContent =
    `Total: ${msg.downloaded}/${msg.target}`;

  progressProviders.innerHTML = "";
  Object.entries(msg.providers).forEach(([name, p]) => {
    const div = document.createElement("div");
    div.textContent =
      `${name}: ${p.downloaded} downloaded`;
    progressProviders.appendChild(div);
  });
}



  if (msg.type === "PAUSED") {
    pauseBtn.textContent = "Resume";
    statusText.textContent = "Status: Paused";
  }

  if (msg.type === "DONE") {
    showIdleUI();
    statusText.textContent = "Status: Completed 🎉";
  }
});

/* ===== EVENTS ===== */
searchBtn.addEventListener("click", handleSearch);
queryInput.addEventListener("keydown", (e) => e.key === "Enter" && handleSearch());
