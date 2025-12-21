import axios from "axios";

const PIXABAY_KEYS = process.env.PIXABAY_API_KEYS
  ? process.env.PIXABAY_API_KEYS.split(",").map(k => k.trim()).filter(Boolean)
  : [];

if (PIXABAY_KEYS.length === 0) {
  throw new Error("❌ PIXABAY_API_KEYS missing in .env");
}

const BASE_URL = "https://pixabay.com/api";
let currentKeyIndex = 0;

/* ---------- rotation helper ---------- */
async function fetchWithRotation(url, params = {}) {
  let attempts = 0;

  while (attempts < PIXABAY_KEYS.length) {
    const key = PIXABAY_KEYS[currentKeyIndex];

    try {
      return await axios.get(url, {
        params: { ...params, key },
      });
    } catch (err) {
      const status = err.response?.status;

      if (status === 403 || status === 429) {
        console.warn(
          `[Pixabay] Key ${currentKeyIndex + 1} exhausted, rotating`
        );
        currentKeyIndex = (currentKeyIndex + 1) % PIXABAY_KEYS.length;
        attempts++;
        continue;
      }

      throw err;
    }
  }

  throw new Error("❌ All Pixabay API keys exhausted");
}

/* ---------- COUNTS ---------- */
export async function getPixabayCount(query, mediaType) {
  if (mediaType === "videos") {
    const res = await fetchWithRotation(`${BASE_URL}/videos/`, {
      q: query,
      per_page: 3,
    });
    return res.data.totalHits || 0;
  }

  const image_type =
    mediaType === "photos"
      ? "photo"
      : mediaType === "illustrations"
      ? "illustration"
      : mediaType === "vectors"
      ? "vector"
      : "photo";

  const res = await fetchWithRotation(`${BASE_URL}/`, {
    q: query,
    image_type,
    per_page: 3,
  });

  return res.data.totalHits || 0;
}

/* ---------- METADATA ---------- */
export async function getPixabayMetadata(query, mediaType, page = 1, perPage = 80) {
  if (mediaType === "videos") {
    const res = await fetchWithRotation(`${BASE_URL}/videos/`, {
      q: query,
      page,
      per_page: perPage,
    });

    return {
      page,
      perPage,
      total: res.data.totalHits || 0,
      items: res.data.hits || [],
    };
  }

  const image_type =
    mediaType === "photos"
      ? "photo"
      : mediaType === "illustrations"
      ? "illustration"
      : mediaType === "vectors"
      ? "vector"
      : "photo";

  const res = await fetchWithRotation(`${BASE_URL}/`, {
    q: query,
    image_type,
    page,
    per_page: perPage,
  });

  return {
    page,
    perPage,
    total: res.data.totalHits || 0,
    items: res.data.hits || [],
  };
}
