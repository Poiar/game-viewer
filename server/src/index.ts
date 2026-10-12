import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { errorHandler } from "./middleware/error-handler.js";

const app = express();

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  }),
);

// ---------------------------------------------------------------------------
// Body parsing & compression
// ---------------------------------------------------------------------------
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    data: null,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please try again later.",
    },
  },
});
app.use(limiter);

// ---------------------------------------------------------------------------
// Routes
import apiRouter from "./routes/index.js";
app.use("/api", apiRouter);
// ---------------------------------------------------------------------------

// Health check
app.get("/health", (_req, res) => {
  res.json({ data: { status: "ok" }, error: null });
});

// ---------------------------------------------------------------------------
// Error handler (must be last)
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(config.port, () => {
  console.log(`[game-viewer API] Server running on http://localhost:${config.port}`);
  console.log(`[game-viewer API] Environment: ${process.env.NODE_ENV ?? "development"}`);
});

export default app;
