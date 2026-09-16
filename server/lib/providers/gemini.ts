import { z } from "zod";
import { ExtractionResultSchema, ReceiptItemSchema } from "../../../shared/schema.js";
import { EXTRACTION_PROMPT } from "./prompt.js";
import type { ExtractionProvider } from "./types.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

type GeminiSchema = Record<string, unknown>;

/**
 * Gemini's `responseSchema` only accepts a subset of OpenAPI 3.0 schema
 * (string/number/enum/object/array + a `nullable` flag, no `oneOf`/`$ref`).
 * This converts our canonical Zod schema into that dialect so the schema
 * itself never has to be hand-duplicated in Gemini's format.
 */
function fieldToGeminiSchema(field: z.ZodTypeAny): GeminiSchema {
  let inner = field;
  let nullable = false;
  if (inner instanceof z.ZodNullable) {
    nullable = true;
    inner = inner.unwrap() as z.ZodTypeAny;
  }

  const description = field.description;
  const base: GeminiSchema = description ? { description } : {};
  if (nullable) base.nullable = true;

  if (inner instanceof z.ZodString) {
    return { ...base, type: "string" };
  }
  if (inner instanceof z.ZodNumber) {
    return { ...base, type: "number" };
  }
  if (inner instanceof z.ZodEnum) {
    return { ...base, type: "string", enum: inner.options };
  }
  throw new Error(`Unsupported zod type for Gemini schema conversion: ${inner.constructor.name}`);
}

function objectToGeminiSchema(schema: typeof ReceiptItemSchema): GeminiSchema {
  const properties: Record<string, GeminiSchema> = {};
  const required: string[] = [];
  for (const [key, field] of Object.entries(schema.shape) as [string, z.ZodTypeAny][]) {
    properties[key] = fieldToGeminiSchema(field);
    if (!field.isOptional()) required.push(key);
  }
  return { type: "object", properties, required };
}

const RESPONSE_SCHEMA: GeminiSchema = {
  type: "object",
  properties: {
    items: { type: "array", items: objectToGeminiSchema(ReceiptItemSchema) },
  },
  required: ["items"],
};

export const extractWithGemini: ExtractionProvider = async (imageBase64, mimeType) => {
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
            parts: [{ text: EXTRACTION_PROMPT }, { inlineData: { mimeType, data: imageBase64 } }],
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

  const parsed = ExtractionResultSchema.parse(JSON.parse(text));
  return parsed.items;
};
