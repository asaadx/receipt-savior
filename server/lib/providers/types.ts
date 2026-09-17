import type { ReceiptItem } from "../../../shared/schema.js";

// Implementations must enforce ReceiptItemSchema via the provider's native
// structured-output mechanism, not prompt instructions.
export type ExtractionProvider = (imageBase64: string, mimeType: string) => Promise<ReceiptItem[]>;
