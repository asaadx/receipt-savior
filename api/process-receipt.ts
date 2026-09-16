import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getExtractionProvider } from "../server/lib/providers/index.js";
import { ensureFolder, uploadImage } from "../server/lib/drive.js";
import { ensureSheet, appendItems } from "../server/lib/sheets.js";
import { buildReceiptFilename } from "../server/lib/filename.js";

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
    const items = await getExtractionProvider()(imageBase64, mimeType);
    if (items.length === 0) {
      throw new Error("No line items could be extracted from this receipt");
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
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
}
