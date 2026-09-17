// Per-field semantics live on the schema's .describe() calls, so this only
// states the task.
export const EXTRACTION_PROMPT =
  "Extract every line item from this receipt image. Follow the provided response schema exactly; each field's description specifies what value it must contain.";
