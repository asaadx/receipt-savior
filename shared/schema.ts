import { z } from "zod";

export const CIBC_CATEGORIES = [
  "Groceries",
  "Restaurants",
  "Transportation",
  "Gas & Automotive",
  "Retail & Clothing",
  "Entertainment & Recreation",
  "Health & Personal Care",
  "Home & Utilities",
  "Professional & Financial Services",
  "Other",
] as const;

// Canonical line item; provider adapters convert it into their own dialect.
// Receipt-wide fields repeat on every item so Sheets can group and blank them.
export const ReceiptItemSchema = z.object({
  name: z.string().describe("The line item's name, as printed on the receipt."),
  quantity: z.number().describe("Quantity purchased for this line item."),
  totalPrice: z.number().describe("Total price charged for this line item (quantity x unit price)."),
  category: z
    .enum(CIBC_CATEGORIES)
    .describe("Classify this line item into exactly one of the allowed expense categories."),
  vendor: z.string().describe("The merchant name. Repeated identically for every item on this receipt."),
  date: z
    .string()
    .describe("The receipt date, formatted YYYY-MM-DD. Repeated identically for every item on this receipt."),
  receiptNumber: z
    .string()
    .nullable()
    .describe(
      "The store-printed receipt, order, or transaction number, if legible on the receipt; null if absent or illegible. Repeated identically for every item on this receipt."
    ),
  subtotal: z
    .number()
    .describe("The receipt subtotal before tax. Repeated identically for every item on this receipt."),
  hst: z
    .number()
    .nullable()
    .describe("The HST amount if the receipt shows one, otherwise null. Repeated identically for every item on this receipt."),
  totalTax: z
    .number()
    .describe("The total of all taxes charged. Repeated identically for every item on this receipt."),
  grandTotal: z
    .number()
    .describe("The final amount charged. Repeated identically for every item on this receipt."),
});

export const ExtractionResultSchema = z.object({
  items: z.array(ReceiptItemSchema),
});

export type ReceiptItem = z.infer<typeof ReceiptItemSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
