import express from "express";
import {
  getPexelsImages,
  getPexelsVideos,
} from "../services/pexels.js";
import { getUnsplashImages } from "../services/unsplash.js";
import { getPixabayMetadata } from "../services/pixabay.js";

const router = express.Router();

/* =========================
   PEXELS
========================= */

/**
 * GET /metadata/pexels/images
 */
router.get("/pexels/images", async (req, res) => {
  const { query, page = 1, perPage = 80 } = req.query;
  if (!query) return res.status(400).json({ error: "query is required" });

  try {
    const data = await getPexelsImages(
      query,
      Number(page),
      Number(perPage)
    );

    res.json({
      provider: "pexels",
      type: "photos",
      query,
      ...data,
    });
  } catch (err) {
    console.error("Pexels images error:", err.message);
    res.status(500).json({ error: "Failed to fetch Pexels images" });
  }
});

/**
 * GET /metadata/pexels/videos
 */
router.get("/pexels/videos", async (req, res) => {
  const { query, page = 1, perPage = 30 } = req.query;
  if (!query) return res.status(400).json({ error: "query is required" });

  try {
    const data = await getPexelsVideos(
      query,
      Number(page),
      Number(perPage)
    );

    res.json({
      provider: "pexels",
      type: "videos",
      query,
      ...data,
    });
  } catch (err) {
    console.error("Pexels videos error:", err.message);
    res.status(500).json({ error: "Failed to fetch Pexels videos" });
  }
});

/* =========================
   UNSPLASH (photos only)
========================= */

/**
 * GET /metadata/unsplash/photos
 */
router.get("/unsplash/images", async (req, res) => {
  const { query, page = 1, perPage = 30 } = req.query;
  if (!query) return res.status(400).json({ error: "query is required" });

  try {
    const data = await getUnsplashImages(
      query,
      Number(page),
      Number(perPage)
    );

    res.json({
      provider: "unsplash",
      type: "photos",
      query,
      ...data,
    });
  } catch (err) {
    console.error("Unsplash photos error:", err.message);
    res.status(500).json({ error: "Failed to fetch Unsplash photos" });
  }
});

/* =========================
   PIXABAY
========================= */

/**
 * GET /metadata/pixabay/photos
 */
router.get("/pixabay/photos", async (req, res) => {
  const { query, page = 1, perPage = 80 } = req.query;
  if (!query) return res.status(400).json({ error: "query is required" });

  try {
    const data = await getPixabayMetadata(
      query,
      "photos",
      Number(page),
      Number(perPage)
    );

    res.json({
      provider: "pixabay",
      type: "photos",
      query,
      ...data,
    });
  } catch (err) {
    console.error("Pixabay photos error:", err.message);
    res.status(500).json({ error: "Failed to fetch Pixabay photos" });
  }
});

/**
 * GET /metadata/pixabay/illustrations
 */
router.get("/pixabay/illustrations", async (req, res) => {
  const { query, page = 1, perPage = 80 } = req.query;
  if (!query) return res.status(400).json({ error: "query is required" });

  try {
    const data = await getPixabayMetadata(
      query,
      "illustrations",
      Number(page),
      Number(perPage)
    );

    res.json({
      provider: "pixabay",
      type: "illustrations",
      query,
      ...data,
    });
  } catch (err) {
    console.error("Pixabay illustrations error:", err.message);
    res.status(500).json({ error: "Failed to fetch Pixabay illustrations" });
  }
});

/**
 * GET /metadata/pixabay/vectors
 */
router.get("/pixabay/vectors", async (req, res) => {
  const { query, page = 1, perPage = 80 } = req.query;
  if (!query) return res.status(400).json({ error: "query is required" });

  try {
    const data = await getPixabayMetadata(
      query,
      "vectors",
      Number(page),
      Number(perPage)
    );

    res.json({
      provider: "pixabay",
      type: "vectors",
      query,
      ...data,
    });
  } catch (err) {
    console.error("Pixabay vectors error:", err.message);
    res.status(500).json({ error: "Failed to fetch Pixabay vectors" });
  }
});

/**
 * GET /metadata/pixabay/videos
 */
router.get("/pixabay/videos", async (req, res) => {
  const { query, page = 1, perPage = 50 } = req.query;
  if (!query) return res.status(400).json({ error: "query is required" });

  try {
    const data = await getPixabayMetadata(
      query,
      "videos",
      Number(page),
      Number(perPage)
    );

    res.json({
      provider: "pixabay",
      type: "videos",
      query,
      ...data,
    });
  } catch (err) {
    console.error("Pixabay videos error:", err.message);
    res.status(500).json({ error: "Failed to fetch Pixabay videos" });
  }
});

export default router;
