import type { ReceiptItem } from "../../shared/schema.js";

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "receipt"
  );
}

/** Builds a descriptive Drive filename like "walmart-2026-09-11-42-17.jpg". */
export function buildReceiptFilename(item: ReceiptItem, mimeType: string): string {
  const extension = EXTENSION_BY_MIME_TYPE[mimeType] ?? "jpg";
  const amountSlug = item.grandTotal.toFixed(2).replace(".", "-");
  return `${slugify(item.vendor)}-${item.date}-${amountSlug}.${extension}`;
}
