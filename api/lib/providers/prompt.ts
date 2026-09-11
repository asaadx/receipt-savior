/**
 * Shared top-level instruction for every provider. Per-field semantics live
 * on the schema itself (see `schema.ts`'s `.describe()` calls) and are
 * carried into each provider's structured-output request automatically, so
 * this only needs to state the task.
 */
export const EXTRACTION_PROMPT =
  "Extract every line item from this receipt image. Follow the provided response schema exactly; each field's description specifies what value it must contain.";
