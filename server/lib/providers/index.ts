import { extractWithGemini } from "./gemini.js";
import { extractWithOpenAI } from "./openai.js";
import type { ExtractionProvider } from "./types.js";
import { config } from "../../config.js";

// Keyed by the LLM_PROVIDER enum, so an unregistered provider is a type error.
const PROVIDERS: Record<typeof config.LLM_PROVIDER, ExtractionProvider> = {
  gemini: extractWithGemini,
  openai: extractWithOpenAI,
};

export function getExtractionProvider(): ExtractionProvider {
  return PROVIDERS[config.LLM_PROVIDER];
}
