import "server-only";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { defaultSettingsMiddleware, wrapLanguageModel } from "ai";
import { aiProvider, createOllamaProvider, ollamaSettings } from "@/lib/ai/provider-config";

export const DEFAULT_MODEL = "openai/gpt-6-luna";

/** Ollama needs no key (the daemon is assumed reachable); OpenRouter needs OPENROUTER_API_KEY. */
export function hintsConfigured(): boolean {
  if (aiProvider() === "ollama") return true;
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/** User-facing "how do I turn this on" text, shared by every route/action that gates on hintsConfigured(). */
export function aiNotConfiguredMessage(feature: string): string {
  return `${feature} isn't configured — set OPENROUTER_API_KEY, or set AI_PROVIDER=ollama, in .env (see the README).`;
}

/** The model id in use — shared so callers persisting it (e.g. QuestionHint.model) don't duplicate the fallback. */
export function modelId(): string {
  if (aiProvider() === "ollama") return `ollama/${ollamaSettings().model}`;
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

/**
 * All Ollama params (num_ctx, temperature, think, OLLAMA_OPTIONS) are applied
 * here once, as model-level defaults, so no call site needs to know which
 * provider is active.
 */
function ollamaModel(think: boolean | undefined) {
  const s = ollamaSettings();
  return wrapLanguageModel({
    model: createOllamaProvider()(s.model),
    middleware: defaultSettingsMiddleware({
      settings: {
        ...(s.temperature !== undefined ? { temperature: s.temperature } : {}),
        providerOptions: {
          ollama: {
            ...(think !== undefined ? { think } : {}),
            options: s.options,
          },
        },
      },
    }),
  });
}

function openRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set.");
  return createOpenRouter({ apiKey });
}

/**
 * Throws if the active provider isn't usable — callers should check hintsConfigured() first.
 * Shared by /api/hint and /api/coach: both are short tutoring responses where
 * reasoning tokens only add latency and cost, never useful visible output.
 */
export function getCoachModel() {
  if (aiProvider() === "ollama") return ollamaModel(ollamaSettings().coachThink);
  return openRouter()(modelId(), { reasoning: { enabled: false, effort: "none" } });
}

/**
 * Structured one-shot analysis over a profile's full practice history
 * (src/actions/stats.ts). Unlike getCoachModel(), reasoning is left at the
 * provider default rather than disabled — this is a heavier one-shot
 * judgment call over an aggregated summary, not a latency-sensitive
 * per-question tutor reply. The OpenRouter response-healing plugin repairs
 * malformed structured output before it reaches generateObject's schema
 * validation, which matters more here than for hints/coach since a bad
 * recommendation schema would otherwise surface as a hard failure instead
 * of a retry. (No Ollama equivalent — it constrains output with a JSON
 * schema `format` instead.)
 */
export function getAnalysisModel() {
  if (aiProvider() === "ollama") return ollamaModel(ollamaSettings().analysisThink);
  return openRouter()(modelId(), { plugins: [{ id: "response-healing" }] });
}
