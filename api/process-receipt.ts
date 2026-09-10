import type { VercelRequest, VercelResponse } from "@vercel/node";
import { extractReceiptItems } from "./lib/gemini";
import { ensureFolder, uploadImage } from "./lib/drive";
import { ensureSheet, appendItems } from "./lib/sheets";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { accessToken, imageBase64, mimeType } = req.body ?? {};
  if (!accessToken || !imageBase64 || !mimeType) {
    res.status(400).json({ error: "accessToken, imageBase64, and mimeType are required" });
    return;
  }

  try {
    const items = await extractReceiptItems(imageBase64, mimeType);
    const folderId = await ensureFolder(accessToken);
    const spreadsheetId = await ensureSheet(accessToken, folderId);

    await Promise.all([
      uploadImage(accessToken, folderId, imageBase64, mimeType, `receipt-${Date.now()}`),
      appendItems(accessToken, spreadsheetId, items),
    ]);

    res.status(200).json({ items });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
}
