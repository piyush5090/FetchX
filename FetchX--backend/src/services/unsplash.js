import axios from "axios";

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

if (!UNSPLASH_ACCESS_KEY) {
  throw new Error("❌ UNSPLASH_ACCESS_KEY missing in .env");
}

const BASE_URL = "https://api.unsplash.com";

/* ---------- COUNTS ---------- */
export async function getUnsplashCount(query) {
  const url = `${BASE_URL}/search/photos?query=${encodeURIComponent(
    query
  )}&page=1&per_page=1`;

  const res = await axios.get(url, {
    headers: {
      Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
    },
  });

  return {
    images: res.data.total || 0,
  };
}

/* ---------- IMAGES ---------- */
export async function getUnsplashImages(query, page = 1, perPage = 30) {
  const url = `${BASE_URL}/search/photos?query=${encodeURIComponent(
    query
  )}&page=${page}&per_page=${perPage}`;

  const res = await axios.get(url, {
    headers: {
      Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
    },
  });

  return {
    page,
    perPage,
    total: res.data.total || 0,
    items: res.data.results || [],
  };
}
