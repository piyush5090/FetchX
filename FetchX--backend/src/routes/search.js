import express from "express";
import { getPexelsCounts } from "../services/pexels.js";
import { getUnsplashCount } from "../services/unsplash.js";

const router = express.Router();

/**
 * GET /search?query=mountains&type=images|videos
 */
router.get("/", async (req, res) => {
  const { query, type } = req.query;

  if (!query) {
    return res.status(400).json({ error: "query is required" });
  }

  // default to images if not provided
  const mediaType = type === "videos" ? "videos" : "images";

  try {
    // Fetch counts in parallel
    const [pexels, unsplash] = await Promise.all([
      getPexelsCounts(query),
      mediaType === "images" ? getUnsplashCount(query) : Promise.resolve(null),
    ]);

    let total = 0;

    if (mediaType === "images") {
      total =
        (pexels?.images || 0) +
        (unsplash?.images || 0);
    }

    if (mediaType === "videos") {
      total = pexels?.videos || 0;
    }

    res.json({
      query,
      mediaType,
      total,
    });
  } catch (err) {
    console.error("Search error:", err.message);
    res.status(500).json({ error: "Failed to fetch counts" });
  }
});

export default router;
