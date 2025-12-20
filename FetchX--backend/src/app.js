import express from "express";
import healthRoutes from "./routes/health.js";
import searchRoutes from "./routes/search.js";
import metadataRoutes from "./routes/metadata.js";

const app = express();

app.use(express.json());

app.use("/health", healthRoutes);
app.use("/search", searchRoutes);
app.use("/metadata", metadataRoutes);

export default app;
