import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { ExtractionResultSchema } from "../../../shared/schema.js";
import { EXTRACTION_PROMPT } from "./prompt.js";
import type { ExtractionProvider } from "./types.js";
import { config } from "../../config.js";

export const extractWithOpenAI: ExtractionProvider = async (imageBase64, mimeType) => {
  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  const completion = await client.chat.completions.parse({
    model: config.OPENAI_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: EXTRACTION_PROMPT },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      },
    ],
    response_format: zodResponseFormat(ExtractionResultSchema, "receipt_extraction"),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) throw new Error("OpenAI returned no parsed content");
  return parsed.items;
};
