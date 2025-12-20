import dotenv from "dotenv";

dotenv.config();

export const PORT = process.env.PORT || 3000;

export const PEXELS_API_KEYS = process.env.PEXELS_API_KEYS
  ? process.env.PEXELS_API_KEYS.split(",").map(k => k.trim())
  : [];

if (PEXELS_API_KEYS.length === 0) {
  throw new Error("❌ PEXELS_API_KEYS missing in .env");
}
