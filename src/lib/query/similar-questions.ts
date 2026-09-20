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
  EMBEDDING_MODEL,
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
    model: EMBEDDING_MODEL,
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
