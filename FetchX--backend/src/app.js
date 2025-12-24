import express from "express";
import healthRoutes from "./routes/health.js";
import searchRoutes from "./routes/search.js";
import metadataRoutes from "./routes/metadata.js";
import cors from "cors";


const app = express();

app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://fetchx-backend.onrender.com",
      /^chrome-extension:\/\//,
      "http://localhost:5173",
    ],
  })
);

app.use("/health", healthRoutes);
app.use("/search", searchRoutes);
app.use("/metadata", metadataRoutes);

export default app;
