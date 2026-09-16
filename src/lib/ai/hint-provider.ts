import "server-only";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const DEFAULT_MODEL = "openai/gpt-5.6-luna";

export function hintsConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/** Throws if OPENROUTER_API_KEY is unset — callers should check hintsConfigured() first. */
export function getHintModel() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set.");
  const openrouter = createOpenRouter({ apiKey });
  return openrouter(process.env.OPENROUTER_MODEL || DEFAULT_MODEL);
}
