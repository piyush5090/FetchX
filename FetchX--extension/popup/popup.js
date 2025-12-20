const BACKEND_URL = "https://fetchx-backend.onrender.com";

const queryInput = document.getElementById("queryInput");
const searchBtn = document.getElementById("searchBtn");
const mediaTypeSelect = document.getElementById("mediaTypeSelect");

const resultsSection = document.getElementById("resultsSection");
const totalResultsEl = document.getElementById("totalResults");
const countInput = document.getElementById("countInput");
const downloadBtn = document.getElementById("downloadBtn");
const statusText = document.getElementById("statusText");

let totalAvailable = 0;

// Search handler (DISCOVERY ONLY)
async function handleSearch() {
  const query = queryInput.value.trim();
  const mediaType = mediaTypeSelect.value;

  if (!query) return;

  statusText.textContent = "Status: Searching...";
  searchBtn.disabled = true;
  resultsSection.classList.add("hidden");
  downloadBtn.disabled = true;

  try {
    const res = await fetch(
      `${BACKEND_URL}/search?query=${encodeURIComponent(query)}&type=${mediaType}`
    );

    if (!res.ok) throw new Error("Search failed");

    const data = await res.json();

    totalAvailable = data.total || 0;
    totalResultsEl.textContent = totalAvailable.toLocaleString();

    resultsSection.classList.remove("hidden");
    statusText.textContent = "Status: Ready";
  } catch (err) {
    console.error(err);
    statusText.textContent = "Status: Error fetching results";
  } finally {
    searchBtn.disabled = false;
  }
}

// Enable download only when count is valid
function handleCountChange() {
  const value = Number(countInput.value);

  if (value > 0 && value <= totalAvailable) {
    downloadBtn.disabled = false;
  } else {
    downloadBtn.disabled = true;
  }
}

// Placeholder for next step
function handleDownload() {
  const query = queryInput.value.trim();
  const count = Number(countInput.value);
  const mediaType = mediaTypeSelect.value;

  statusText.textContent = `Status: Download requested (${count})`;
  console.log("Download intent:", { query, mediaType, count });
}

// Events
searchBtn.addEventListener("click", handleSearch);
queryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSearch();
});
countInput.addEventListener("input", handleCountChange);
downloadBtn.addEventListener("click", handleDownload);
