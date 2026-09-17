import { extractWithGemini } from "./gemini.js";
import { extractWithOpenAI } from "./openai.js";
import type { ExtractionProvider } from "./types.js";

const PROVIDERS: Record<string, ExtractionProvider> = {
  gemini: extractWithGemini,
  openai: extractWithOpenAI,
};

/** Selects the extraction provider via `LLM_PROVIDER` (defaults to Gemini). */
export function getExtractionProvider(): ExtractionProvider {
  const name = process.env.LLM_PROVIDER || "gemini";
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown LLM_PROVIDER "${name}". Supported providers: ${Object.keys(PROVIDERS).join(", ")}`);
  }
  return provider;
}
