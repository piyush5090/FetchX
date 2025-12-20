const BACKEND_URL = "https://fetchx-backend.onrender.com";

// Elements
const searchInput = document.querySelector(".search-box input");
const searchButton = document.querySelector(".search-box button");
const statusText = document.querySelector(".footer span");
const mediaSelect = document.getElementById("mediaSelect");
const providerRows = document.querySelectorAll(".provider");

// Health check
async function checkHealth() {
  try {
    const res = await fetch(`${BACKEND_URL}/health`);
    if (!res.ok) throw new Error("Health check failed");

    statusText.textContent = "Status: Connected";
    searchInput.disabled = false;
    searchButton.disabled = false;
  } catch (err) {
    statusText.textContent = "Status: Backend offline";
  }
}

// Search handler
async function handleSearch() {
  const query = searchInput.value.trim();
  const mediaType = mediaSelect.value;

  if (!query) return;

  statusText.textContent = "Status: Preparing metadata...";
  searchButton.disabled = true;

  // Tell background about job
  chrome.runtime.sendMessage(
    {
      type: "START_SEARCH",
      query,
      mediaType,
    },
    () => {}
  );

  // Start metadata loop
  chrome.runtime.sendMessage(
    {
      type: "START_METADATA",
    },
    (response) => {
      if (!response?.ok) {
        statusText.textContent = "Status: Metadata error";
      }
    }
  );
}

// Listen for progress from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "METADATA_PROGRESS") {
    statusText.textContent = `Metadata fetched: ${message.payload.totalFetched}`;
  }

  if (message.type === "METADATA_DONE") {
    statusText.textContent = `Metadata ready (${message.payload.totalFetched})`;
    searchButton.disabled = false;
  }
});

// Events
searchButton.addEventListener("click", handleSearch);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSearch();
});

// Init
checkHealth();

// Background ping
chrome.runtime.sendMessage({ type: "PING" }, (response) => {
  if (response?.ok) {
    console.log("Background connected:", response.status);
  }
});
