import "dotenv/config";
import { z } from "zod";

// Validated once at startup so a misconfigured server refuses to boot instead
// of failing one request at a time.
const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LLM_PROVIDER: z.enum(["gemini", "openai"]).default("gemini"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.6-flash"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-2024-08-06"),
});

// Only the selected provider's key is required.
const API_KEY_BY_PROVIDER = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
} as const satisfies Record<z.infer<typeof EnvSchema>["LLM_PROVIDER"], string>;

// Exits rather than throws: an import-time stack trace buries the real problem.
function fail(problems: string[]): never {
  console.error("Invalid environment configuration:");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("\nSee .env.example for the expected variables.");
  process.exit(1);
}

function loadConfig() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    fail(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
  }

  const env = parsed.data;
  const requiredKey = API_KEY_BY_PROVIDER[env.LLM_PROVIDER];
  if (!env[requiredKey]) {
    fail([`${requiredKey} is required because LLM_PROVIDER is "${env.LLM_PROVIDER}"`]);
  }

  return env;
}

export const config = loadConfig();
