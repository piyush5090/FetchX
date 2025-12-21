import axios from "axios";

const UNSPLASH_KEYS = process.env.UNSPLASH_ACCESS_KEY
  ? process.env.UNSPLASH_ACCESS_KEY.split(",").map(k => k.trim())
  : [];

if (UNSPLASH_KEYS.length === 0) {
  throw new Error("❌ UNSPLASH_ACCESS_KEY missing in .env");
}

const BASE_URL = "https://api.unsplash.com";
let currentKeyIndex = 0;

/* ---------- INTERNAL HELPER ---------- */
async function fetchWithRotation(url, params = {}) {
  let attempts = 0;

  while (attempts < UNSPLASH_KEYS.length) {
    const key = UNSPLASH_KEYS[currentKeyIndex];
    console.log(UNSPLASH_KEYS.length);
    try {
      const res = await axios.get(url, {
        params,
        headers: {
          Authorization: `Client-ID ${key}`,
        },
      });
      return res;
    } catch (err) {
      const status = err.response?.status;

      console.log(err);
      // Rotate key on quota / auth failure
      if (status === 403 || status === 429) {
        console.warn(
          `⚠️ Unsplash key quota hit (key ${currentKeyIndex + 1}), rotating...`
        );
        currentKeyIndex = (currentKeyIndex + 1) % UNSPLASH_KEYS.length;
        attempts++;
        continue;
      }
      console.log(err);
      throw err;
    }
  }

  throw new Error("❌ All Unsplash API keys exhausted");
}

/* ---------- COUNTS ---------- */
export async function getUnsplashCount(query) {
  const res = await fetchWithRotation(
    `${BASE_URL}/search/photos`,
    {
      query,
      page: 1,
      per_page: 1,
    }
  );

  return {
    images: res.data.total || 0,
  };
}

/* ---------- IMAGES ---------- */
export async function getUnsplashImages(query, page = 1, perPage = 30) {
  const res = await fetchWithRotation(
    `${BASE_URL}/search/photos`,
    {
      query,
      page,
      per_page: perPage,
    }
  );

  return {
    page,
    perPage,
    total: res.data.total || 0,
    items: res.data.results || [],
  };
}
