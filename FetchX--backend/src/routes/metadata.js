import express from "express";
import {
  getPexelsImages,
  getPexelsVideos,
} from "../services/pexels.js";
import { getUnsplashImages } from "../services/unsplash.js";

const router = express.Router();

/**
 * GET /metadata/images?query=mountains&page=1&perPage=30
 */
router.get("/images", async (req, res) => {
  const { query, page = 1, perPage = 30 } = req.query;

  if (!query) {
    return res.status(400).json({ error: "query is required" });
  }

  try {
    const data = await getPexelsImages(
      query,
      Number(page),
      Number(perPage)
    );

    res.json({
      provider: "pexels",
      type: "images",
      query,
      ...data,
    });
  } catch (err) {
    console.error("Images error:", err.message);
    res.status(500).json({ error: "Failed to fetch images" });
  }
});

/**
 * GET /metadata/videos?query=mountains&page=1&perPage=30
 */
router.get("/videos", async (req, res) => {
  const { query, page = 1, perPage = 30 } = req.query;

  if (!query) {
    return res.status(400).json({ error: "query is required" });
  }

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
    console.error("Videos error:", err.message);
    res.status(500).json({ error: "Failed to fetch videos" });
  }
});

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
      type: "images",
      query,
      ...data,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch Unsplash images" });
  }
});

export default router;
