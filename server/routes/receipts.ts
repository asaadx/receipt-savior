import { Router } from "express";
import { z } from "zod";
import { getExtractionProvider } from "../lib/providers/index.js";
import { ensureFolder, uploadImage } from "../lib/drive.js";
import { ensureSheet, appendItems } from "../lib/sheets.js";
import { buildReceiptFilename } from "../lib/filename.js";
import { AppError } from "../lib/errors.js";

/**
 * Phase 1 keeps the synchronous request shape: the browser base64-encodes one
 * image and waits for extraction, Drive upload, and the Sheets append to
 * finish. Phase 3 replaces `imageBase64` with S3 keys and phase 4 moves the
 * work off the request path entirely.
 */
const ProcessReceiptRequest = z.object({
  accessToken: z.string().min(1),
  imageBase64: z.string().min(1),
  mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/i, "must be an image MIME type"),
});

export const receiptsRouter = Router();

receiptsRouter.post("/receipts", async (req, res, next) => {
  const parsed = ProcessReceiptRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid request",
      details: parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`),
    });
    return;
  }

  const { accessToken, imageBase64, mimeType } = parsed.data;

  try {
    const items = await getExtractionProvider()(imageBase64, mimeType);
    if (items.length === 0) {
      throw new AppError("No line items could be extracted from this receipt.", 422);
    }

    const folderId = await ensureFolder(accessToken);
    const fileName = buildReceiptFilename(items[0], mimeType);

    const [{ spreadsheetId, sheetId }, uploaded] = await Promise.all([
      ensureSheet(accessToken, folderId),
      uploadImage(accessToken, folderId, imageBase64, mimeType, fileName),
    ]);

    await appendItems(accessToken, spreadsheetId, sheetId, items, uploaded.webViewLink);

    res.status(200).json({ items });
  } catch (err) {
    next(err);
  }
});
