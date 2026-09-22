import "server-only";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export const DEFAULT_MODEL = "openai/gpt-6-luna";

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

/**
 * Structured one-shot analysis over a profile's full practice history
 * (src/actions/stats.ts). Unlike getCoachModel(), reasoning is left at the
 * provider default rather than disabled — this is a heavier one-shot
 * judgment call over an aggregated summary, not a latency-sensitive
 * per-question tutor reply. The response-healing plugin repairs malformed
 * structured output before it reaches generateObject's schema validation,
 * which matters more here than for hints/coach since a bad recommendation
 * schema would otherwise surface as a hard failure instead of a retry.
 */
export function getAnalysisModel() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set.");
  const openrouter = createOpenRouter({ apiKey });
  return openrouter(modelId(), { plugins: [{ id: "response-healing" }] });
}
