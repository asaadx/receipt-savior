import type { ReceiptItem } from "../schema.js";

/**
 * A provider extracts structured receipt line items from a receipt image.
 * Every implementation must enforce `schema.ts`'s `ReceiptItemSchema` using
 * that provider's native structured-output mechanism (not prompt-only
 * instructions), so swapping providers never changes the output contract.
 */
export type ExtractionProvider = (imageBase64: string, mimeType: string) => Promise<ReceiptItem[]>;
