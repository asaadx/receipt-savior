import { randomUUID } from "node:crypto";
import express, { type ErrorRequestHandler } from "express";
import { receiptsRouter } from "./routes/receipts.js";
import { AppError } from "./lib/errors.js";

// Logs the real fault server-side, returns a generic message correlated by
// request id. Only AppError messages are safe to expose.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  const requestId = randomUUID();
  console.error(`[${requestId}] unhandled request failure:`, err);
  res.status(500).json({
    error: "Receipt processing failed. Please try again.",
    requestId,
  });
};

export function createApp() {
  const app = express();

  // Phase 1 posts base64 images inline; the 100kb default rejects every
  // receipt. Drops back once Phase 3 uploads to S3.
  app.use(express.json({ limit: "25mb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", receiptsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(errorHandler);

  return app;
}
