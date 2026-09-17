import "server-only";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export const DEFAULT_MODEL = "openai/gpt-5.6-luna";

export function hintsConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/** The OpenRouter model id in use — shared so callers persisting it (e.g. QuestionHint.model) don't duplicate the fallback. */
export function modelId(): string {
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

/**
 * Throws if OPENROUTER_API_KEY is unset — callers should check hintsConfigured() first.
 * Shared by /api/hint and /api/coach: both are short tutoring responses where
 * reasoning tokens only add latency and cost, never useful visible output.
 */
export function getCoachModel() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set.");
  const openrouter = createOpenRouter({ apiKey });
  return openrouter(modelId(), { reasoning: { enabled: false, effort: "none" } });
}
