// "View similar problems" — I/O wrapper around the pure index/cosine math in
// src/lib/embeddings/core.ts. Sibling of browse-questions.ts; server-only
// because, unlike browse-filters.ts, nothing here needs to run in the browser.
//
// The whole embedding matrix (~3.8k questions x 3072 dims x 4 bytes ≈ 46MB)
// is loaded once and cached on `globalThis`, exactly as src/prisma/db.ts
// caches `db`/`param` — and for the same Turbopack reason: each route/action
// entrypoint is bundled separately, so a plain module-level cache would be
// re-populated per entrypoint instead of shared. See db.ts's file comment.
import "server-only";
import { db } from "@/prisma/db";
import {
  embeddingModelId,
  EMBEDDING_TEXT_VARIANT,
  buildEmbeddingIndex,
  type EmbeddingIndex,
  type SimilarityHit,
} from "@/lib/embeddings/core";

// Past this, "similar" stops meaning anything useful, and it keeps the
// downstream SQL array param (browse-questions.ts) small — 10 pages at
// BROWSE_PAGE_SIZE (20).
export const SIMILAR_POOL_SIZE = 200;

declare global {
  var __getgudEmbeddingIndex: EmbeddingIndex | undefined;
}

/**
 * Cached unconditionally (NOT gated on NODE_ENV, unlike db.ts's dev-only
 * cache — that guard exists there to survive Fast Refresh re-evaluating the
 * module; reloading this 46MB matrix per request under `next start` would be
 * a real cost). Never caches an empty index: if `pnpm embed` hasn't run yet
 * (or runs while the dev server is already up), every call re-checks the DB
 * instead of latching "no embeddings" until a restart.
 */
async function getIndex(): Promise<EmbeddingIndex> {
  if (globalThis.__getgudEmbeddingIndex && globalThis.__getgudEmbeddingIndex.size > 0) {
    return globalThis.__getgudEmbeddingIndex;
  }

  const rows = await db.orm.public.QuestionEmbedding.where({
    model: embeddingModelId(),
    textVariant: EMBEDDING_TEXT_VARIANT,
  })
    .select("questionId", "dim", "vector")
    .all();

  const index = buildEmbeddingIndex(rows);
  if (index.size > 0) globalThis.__getgudEmbeddingIndex = index;
  return index;
}

/** True once `pnpm embed` has populated at least one row — lets the UI hide the affordance entirely otherwise. */
export async function similarSearchAvailable(): Promise<boolean> {
  const index = await getIndex();
  return index.size > 0;
}

/**
 * Ranked neighbours of `questionId`, source excluded, best first. Empty when
 * the index has no embeddings yet or the id isn't in it (e.g. embedded under
 * a different model than the one currently configured).
 */
export async function rankSimilar(questionId: string, limit: number = SIMILAR_POOL_SIZE): Promise<SimilarityHit[]> {
  const index = await getIndex();
  if (!index.has(questionId)) return [];
  return index.topK(questionId, limit);
}

/**
 * Ranked matches for an arbitrary query vector (e.g. an embedded free-text
 * prompt from "Smart select"), restricted to `allow` — the set of question
 * ids that already match a practice-set builder's filters. `query` must be
 * L2-normalized to the same convention every stored vector uses (cosine =
 * plain dot product); see src/lib/query/smart-select.ts for the caller.
 */
export async function rankByVector(
  query: Float32Array,
  allow: ReadonlySet<string>,
  limit: number,
): Promise<SimilarityHit[]> {
  const index = await getIndex();
  if (index.size === 0) return [];
  return index.topKForVector(query, limit, allow);
}

/**
 * How many candidates "Smart select" should re-rank with an LLM, scaled to
 * the requested set size — a fixed cap would either starve a large request
 * (a 30-question ask re-ranked from only 48 candidates) or make the slider's
 * max (50) impossible to fill even when the pool has plenty of good matches.
 * Capped at 120 to keep the re-rank prompt's token cost bounded.
 */
export function rerankCandidateCount(questionCount: number): number {
  return Math.min(120, Math.max(48, questionCount * 3));
}
