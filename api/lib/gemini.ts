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

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  category: (typeof CIBC_CATEGORIES)[number];
  vendor: string;
  date: string;
  subtotal: number;
  hst: number | null;
  totalTax: number;
  grandTotal: number;
}

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: "number" },
          unitPrice: { type: "number" },
          totalPrice: { type: "number" },
          category: { type: "string", enum: [...CIBC_CATEGORIES] },
          vendor: { type: "string" },
          date: { type: "string", description: "Receipt date, YYYY-MM-DD" },
          subtotal: { type: "number" },
          hst: { type: "number", nullable: true },
          totalTax: { type: "number" },
          grandTotal: { type: "number" },
        },
        required: [
          "name",
          "quantity",
          "unitPrice",
          "totalPrice",
          "category",
          "vendor",
          "date",
          "subtotal",
          "totalTax",
          "grandTotal",
        ],
      },
    },
  },
  required: ["items"],
};

export async function extractReceiptItems(
  imageBase64: string,
  mimeType: string
): Promise<ReceiptItem[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  "Extract every line item from this receipt. For each item, return: name, quantity, unitPrice, totalPrice, and category (classify the item into exactly one of these categories: " +
                  CIBC_CATEGORIES.join(", ") +
                  "). Also read these receipt-wide values and repeat them identically on every item: vendor (merchant name), date (the receipt date, formatted YYYY-MM-DD), subtotal, hst (the HST amount if the receipt shows one, otherwise null), totalTax (the total of all taxes charged), and grandTotal (the final amount charged).",
              },
              { inlineData: { mimeType, data: imageBase64 } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini request failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");

  const parsed = JSON.parse(text) as { items?: ReceiptItem[] };
  return parsed.items ?? [];
}
