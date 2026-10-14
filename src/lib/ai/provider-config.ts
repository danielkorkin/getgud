// Env-driven AI provider selection. NO "server-only" import, deliberately:
// src/lib/embeddings/core.ts imports this and is also run under plain `tsx`
// by scripts/embed-questions.ts, where `server-only` throws on load (see
// core.ts's header). Chat and embeddings are selected independently so a
// student can run fully local, fully hosted, or mixed.

import { createOllama } from "ollama-ai-provider-v2";

// Structurally the AI SDK's JSONValue (providerOptions requires it); @ai-sdk/provider
// isn't a direct dependency, so it's restated here rather than imported.
type JSONValue = null | string | number | boolean | JSONValue[] | { [key: string]: JSONValue | undefined };
type JSONObject = { [key: string]: JSONValue | undefined };

export type Provider = "openrouter" | "ollama";

function parseProvider(name: string): Provider {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (raw === "" || raw === "openrouter") return "openrouter";
  if (raw === "ollama") return "ollama";
  throw new Error(`${name} must be "openrouter" or "ollama" (got "${process.env[name]}").`);
}

/** Provider for hints, coach, stats analysis and Smart select's re-rank. */
export function aiProvider(): Provider {
  return parseProvider("AI_PROVIDER");
}

/** Provider for `pnpm embed`, "View similar problems" and Smart select's retrieval. */
export function embeddingProvider(): Provider {
  return parseProvider("EMBEDDING_PROVIDER");
}

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/api";
export const DEFAULT_OLLAMA_MODEL = "qwen3:8b";
export const DEFAULT_OLLAMA_EMBEDDING_MODEL = "embeddinggemma";
export const DEFAULT_OLLAMA_NUM_CTX = 16384;

function optionalNumber(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number (got "${raw}").`);
  return n;
}

function optionalBool(name: string): boolean | undefined {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new Error(`${name} must be true or false (got "${process.env[name]}").`);
}

function optionalJsonObject(name: string): JSONObject {
  const raw = process.env[name]?.trim();
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${name} must be a JSON object, e.g. {"top_k":40} (got "${raw}").`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object, e.g. {"top_k":40}.`);
  }
  return parsed as JSONObject;
}

export interface OllamaSettings {
  baseURL: string;
  model: string;
  embeddingModel: string;
  temperature: number | undefined;
  coachThink: boolean | undefined;
  analysisThink: boolean | undefined;
  /** Native Ollama `options` (num_ctx plus anything in OLLAMA_OPTIONS; the latter wins). */
  options: JSONObject;
}

export function ollamaSettings(): OllamaSettings {
  return {
    baseURL: process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE_URL,
    model: process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL,
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL?.trim() || DEFAULT_OLLAMA_EMBEDDING_MODEL,
    temperature: optionalNumber("OLLAMA_TEMPERATURE"),
    // Coach/hints default to thinking off, mirroring OpenRouter's disabled reasoning.
    coachThink: optionalBool("OLLAMA_COACH_THINK") ?? false,
    analysisThink: optionalBool("OLLAMA_ANALYSIS_THINK"),
    options: {
      num_ctx: optionalNumber("OLLAMA_NUM_CTX") ?? DEFAULT_OLLAMA_NUM_CTX,
      ...optionalJsonObject("OLLAMA_OPTIONS"),
    },
  };
}

export function createOllamaProvider() {
  return createOllama({ baseURL: ollamaSettings().baseURL });
}
