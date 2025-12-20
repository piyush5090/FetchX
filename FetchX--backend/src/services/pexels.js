import axios from "axios";
import { PEXELS_API_KEYS } from "../config/env.js";

let currentKeyIndex = 0;

/**
 * Internal helper: fetch with API key rotation
 */
async function fetchFromPexels(url) {
  while (true) {
    try {
      const res = await axios.get(url, {
        headers: {
          Authorization: PEXELS_API_KEYS[currentKeyIndex],
        },
      });
      return res.data;
    } catch (err) {
      if (err.response?.status === 429) {
        console.warn(
          `⚠️ Pexels rate limit hit. Rotating key (${currentKeyIndex + 1})`
        );
        currentKeyIndex =
          (currentKeyIndex + 1) % PEXELS_API_KEYS.length;
        continue;
      }
      throw err;
    }
  }
}

/* ---------- COUNTS ---------- */
export async function getPexelsCounts(query) {
  const q = encodeURIComponent(query);

  const photoUrl = `https://api.pexels.com/v1/search?query=${q}&per_page=1&page=1`;
  const videoUrl = `https://api.pexels.com/videos/search?query=${q}&per_page=1&page=1`;

  const [photos, videos] = await Promise.all([
    fetchFromPexels(photoUrl),
    fetchFromPexels(videoUrl),
  ]);

  return {
    images: photos.total_results || 0,
    videos: videos.total_results || 0,
  };
}

/* ---------- IMAGES ---------- */
export async function getPexelsImages(query, page = 1, perPage = 30) {
  const q = encodeURIComponent(query);
  const url = `https://api.pexels.com/v1/search?query=${q}&page=${page}&per_page=${perPage}`;

  const data = await fetchFromPexels(url);

  return {
    page,
    perPage,
    total: data.total_results || 0,
    items: data.photos || [],
  };
}

/* ---------- VIDEOS ---------- */
export async function getPexelsVideos(query, page = 1, perPage = 30) {
  const q = encodeURIComponent(query);
  const url = `https://api.pexels.com/videos/search?query=${q}&page=${page}&per_page=${perPage}`;

  const data = await fetchFromPexels(url);

  return {
    page,
    perPage,
    total: data.total_results || 0,
    items: data.videos || [],
  };
}
