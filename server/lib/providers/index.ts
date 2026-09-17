import { extractWithGemini } from "./gemini.js";
import { extractWithOpenAI } from "./openai.js";
import type { ExtractionProvider } from "./types.js";
import { config } from "../../config.js";

/**
 * Keyed by the `LLM_PROVIDER` enum, so adding a provider to the config schema
 * without registering it here is a type error rather than a runtime failure.
 */
const PROVIDERS: Record<typeof config.LLM_PROVIDER, ExtractionProvider> = {
  gemini: extractWithGemini,
  openai: extractWithOpenAI,
};

/** Selects the extraction provider validated at startup by `config.ts`. */
export function getExtractionProvider(): ExtractionProvider {
  return PROVIDERS[config.LLM_PROVIDER];
}
