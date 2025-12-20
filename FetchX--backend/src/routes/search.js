import express from "express";
import { getPexelsCounts } from "../services/pexels.js";
import { getUnsplashCount } from "../services/unsplash.js";

const router = express.Router();

/**
 * GET /search?query=mountains
 */
router.get("/", async (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: "query is required" });
  }

  try {
    const [pexels, unsplash] = await Promise.all([
      getPexelsCounts(query),
      getUnsplashCount(query),
    ]);

    res.json({
      query,
      providers: {
        pexels,
        unsplash,
      },
    });
  } catch (err) {
    console.error("Search error:", err.message);
    res.status(500).json({ error: "Failed to fetch counts" });
  }
});

export default router;
