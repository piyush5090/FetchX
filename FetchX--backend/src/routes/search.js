import express from "express";
import { getPexelsCounts } from "../services/pexels.js";
import { getUnsplashCount } from "../services/unsplash.js";
import { getPixabayCount } from "../services/pixabay.js";

const router = express.Router();

/* Provider limits */
const UNSPLASH_MAX_PAGES = 125;
const UNSPLASH_PER_PAGE = 30;
const PIXABAY_MAX_ITEMS = 500;

/**
 * GET /search?query=mountains&type=images
 */
router.get("/", async (req, res) => {
  const { query, type = "images" } = req.query;

  if (!query) {
    return res.status(400).json({ error: "query is required" });
  }

  try {
    /* ---------- RAW COUNTS ---------- */

    const [pexels, unsplash, pixabay] = await Promise.all([
      getPexelsCounts(query, type),
      type === "images"
        ? getUnsplashCount(query)
        : Promise.resolve({ images: 0 }),
      getPixabayCount(query, type),
    ]);

    /* ---------- NORMALIZATION ---------- */

    const pexelsAvailable = pexels?.[type] || 0;
    const pexelsUsable = pexelsAvailable; // no cap

    const unsplashAvailable = unsplash?.images || 0;
    const unsplashCap = UNSPLASH_MAX_PAGES * UNSPLASH_PER_PAGE;
    const unsplashUsable = Math.min(unsplashAvailable, unsplashCap);

    const pixabayAvailable = pixabay || 0;
    const pixabayUsable = Math.min(pixabayAvailable, PIXABAY_MAX_ITEMS);

    const maxDownloadLimit =
      pexelsUsable + unsplashUsable + pixabayUsable;

    /* ---------- RESPONSE (UI + ENGINE SAFE) ---------- */

    res.json({
      query,
      mediaType: type,
      maxDownloadLimit,

      providers: {
        pexels: {
          images: pexelsUsable,
          available: pexelsAvailable,
          usable: pexelsUsable,
        },

        unsplash: {
          images: unsplashUsable,
          available: unsplashAvailable,
          usable: unsplashUsable,
          cap: `${UNSPLASH_MAX_PAGES} pages`,
        },

        pixabay: {
          images: pixabayUsable,
          available: pixabayAvailable,
          usable: pixabayUsable,
          cap: `${PIXABAY_MAX_ITEMS} items`,
        },
      },
    });
  } catch (err) {
    console.error("Search error:", err.message);
    res.status(500).json({ error: "Failed to fetch search counts" });
  }
});

export default router;
