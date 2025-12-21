console.log("POPUP LOADED");

// const BACKEND_URL = "https://fetchx-backend.onrender.com";
const BACKEND_URL = "http://localhost:3000";

/* DOM */
const queryInput = document.getElementById("queryInput");
const searchBtn = document.getElementById("searchBtn");
const mediaTypeSelect = document.getElementById("mediaTypeSelect");

const resultsSection = document.getElementById("resultsSection");
const providerResults = document.getElementById("providerResults");
const maxLimitEl = document.getElementById("maxLimit");

const countInput = document.getElementById("countInput");
const downloadBtn = document.getElementById("downloadBtn");
const statusText = document.getElementById("statusText");

const progressSection = document.getElementById("progressSection");
const progressTotal = document.getElementById("progressTotal");
const progressProviders = document.getElementById("progressProviders");

/* State */
let maxDownloadLimit = 0;

/* Search */
async function handleSearch() {
  const query = queryInput.value.trim();
  const type = mediaTypeSelect.value;
  if (!query) return;

  statusText.textContent = "Status: Searching...";
  searchBtn.disabled = true;
  resultsSection.classList.add("hidden");
  progressSection.classList.add("hidden");
  providerResults.innerHTML = "";
  countInput.value = "";
  downloadBtn.disabled = true;

  try {
    const res = await fetch(
      `${BACKEND_URL}/search?query=${encodeURIComponent(query)}&type=${type}`
    );
    const data = await res.json();

    maxDownloadLimit = data.maxDownloadLimit || 0;
    maxLimitEl.textContent = maxDownloadLimit.toLocaleString();

    Object.entries(data.providers).forEach(([name, info]) => {
      const row = document.createElement("div");
      row.className = "provider-row";

      row.innerHTML = `
        <span>${name.charAt(0).toUpperCase() + name.slice(1)}</span>
        <span>${
          info.available !== info.usable
            ? `${info.available.toLocaleString()} (usable: ${info.usable.toLocaleString()})`
            : info.available.toLocaleString()
        }</span>
      `;

      providerResults.appendChild(row);
    });

    resultsSection.classList.remove("hidden");
    statusText.textContent = "Status: Ready";
  } catch (e) {
    statusText.textContent = "Status: Search failed";
  } finally {
    searchBtn.disabled = false;
  }
}

/* Count input */
countInput.addEventListener("input", () => {
  let v = Number(countInput.value);
  if (v > maxDownloadLimit) {
    countInput.value = maxDownloadLimit;
    v = maxDownloadLimit;
  }
  downloadBtn.disabled = !(v > 0 && v <= maxDownloadLimit);
});

/* Download */
downloadBtn.addEventListener("click", () => {
  const targetCount = Number(countInput.value);

  chrome.runtime.sendMessage(
    {
      type: "CREATE_JOB",
      query: queryInput.value.trim(),
      mediaType: mediaTypeSelect.value,
      targetCount,
    },
    () => {
      statusText.textContent = "Status: Downloading...";
      progressSection.classList.remove("hidden");
    }
  );
});

/* Progress listener */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "PROGRESS") {
    progressTotal.textContent = `Total: ${msg.downloaded}/${msg.target}`;
    progressProviders.innerHTML = "";

    Object.entries(msg.providers).forEach(([name, p]) => {
      const row = document.createElement("div");
      row.textContent = `${name}: ${p.downloaded} downloaded (${p.remaining} left)`;
      progressProviders.appendChild(row);
    });
  }

  if (msg.type === "DONE") {
    statusText.textContent = "Status: Completed 🎉";
  }
});

/* Events */
searchBtn.addEventListener("click", handleSearch);
queryInput.addEventListener("keydown", (e) => e.key === "Enter" && handleSearch());
