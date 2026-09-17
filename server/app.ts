import { randomUUID } from "node:crypto";
import express, { type ErrorRequestHandler } from "express";
import { receiptsRouter } from "./routes/receipts.js";
import { AppError } from "./lib/errors.js";

/**
 * Logs the real fault server-side and returns a generic message to the client,
 * correlated by request id. Only `AppError` messages are considered safe to
 * expose (see `lib/errors.ts`).
 */
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

  // 25mb because the phase-1 flow still posts base64 image data inline; Express
  // defaults to 100kb, which every real receipt exceeds. Phase 3 uploads direct
  // to S3 and this drops back to the default.
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
