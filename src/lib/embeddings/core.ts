// Pure embedding logic for "View similar problems" — text building, the
// OpenRouter embedding model, and the in-process cosine-similarity index.
// NO "server-only" import here, deliberately: this module is imported by
// BOTH `scripts/embed-questions.ts` (run under plain `tsx`, i.e. Node with no
// react-server condition) and the server-only `src/lib/query/similar-questions.ts`.
// `server-only`'s package.json maps the "default" export condition to a file
// that unconditionally throws — importing it (even transitively, e.g. via
// `src/lib/ai/hint-provider.ts`) from a `tsx` script crashes immediately on
// load. This is the same reason `src/prisma/db.ts` itself has no `server-only`
// import even though only Server Components/Actions are meant to call it.
//
// Model choice: `google/gemini-embedding-2`, text variant `full` (stimulus +
// stem + answer options concatenated) — the winner on every axis of a 33-model
// benchmark run against this exact question bank (see ../../../../other/or-emb,
// a sibling project; not a runtime dependency of this app). or-emb's cached
// vectors are NOT reused here: they were computed from raw scraped HTML via
// or-emb's own text extraction (spoken-form math alt-text), which differs from
// this app's own canonical Postgres columns (real LaTeX, via `pnpm convert:math`).
// Embedding fresh from Question.{stimulus,stem,answerOptions} keeps one
// self-contained source of truth and produces a better representation than
// the spoken-form math or-emb had to work with.

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { AnswerOption } from "@/lib/grading";
import { createOllamaProvider, embeddingProvider, ollamaSettings } from "@/lib/ai/provider-config";

export const OPENROUTER_EMBEDDING_MODEL = "google/gemini-embedding-2";

/**
 * The id stored in QuestionEmbedding.model and used to filter the index.
 * Ollama models live under an `ollama/` prefix so they can never collide with
 * an OpenRouter slug, and switching providers is additive (the table is keyed
 * by model) — but you must re-run `pnpm embed` for the new id to have rows.
 */
export function embeddingModelId(): string {
  return embeddingProvider() === "ollama"
    ? `ollama/${ollamaSettings().embeddingModel}`
    : OPENROUTER_EMBEDDING_MODEL;
}

/** Ollama needs no key; OpenRouter needs OPENROUTER_API_KEY. */
export function embeddingsConfigured(): boolean {
  return embeddingProvider() === "ollama" || Boolean(process.env.OPENROUTER_API_KEY);
}
export const EMBEDDING_TEXT_VARIANT = "full";
export const EMBEDDING_DIM = 3072;

// or-emb's embed.py: CHARS_PER_TOKEN=3.5, CONTEXT_SAFETY_MARGIN=0.85, applied
// to gemini-embedding-2's 8192-token context. Kept here as a safety net —
// nothing in this bank currently exceeds it (measured max ~17.2k chars vs an
// average ~761 after stripping), but a future question source might.
const CONTEXT_LENGTH = 8192;
const CHARS_PER_TOKEN = 3.5;
const CONTEXT_SAFETY_MARGIN = 0.85;
export const MAX_EMBEDDING_CHARS = Math.floor(CONTEXT_LENGTH * CHARS_PER_TOKEN * CONTEXT_SAFETY_MARGIN);

// OpenRouter's embeddings endpoint has no declared maxEmbeddingsPerCall for
// this model (verified: OpenRouterEmbeddingModel.maxEmbeddingsPerCall is
// `undefined`), so `embedMany` will NOT auto-chunk a large `values` array —
// callers must batch themselves. 64 matches or-emb's own embed.py batch size.
export const EMBEDDING_BATCH_SIZE = 64;

export function embeddingModelSlug(model: string): string {
  return model.replace(/\//g, "__").replace(/:/g, "_");
}

/** Strip HTML tags (including base64 <img> payloads) and decode entities to plain text. */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
      const NAMED: Record<string, string> = {
        amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
        hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘",
        rdquo: "”", ldquo: "“", deg: "°", macr: "¯", plusmn: "±",
        times: "×", divide: "÷", le: "≤", ge: "≥", ne: "≠", infin: "∞",
        pi: "π", middot: "·", minus: "−", ang: "∠",
      };
      if (entity[0] === "#") {
        const codePoint =
          entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
      }
      return NAMED[entity] ?? match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

export interface EmbeddableQuestion {
  stimulus: string | null;
  stem: string;
  answerOptions: unknown;
}

/**
 * The `full` text variant: stimulus + stem + each answer option's content,
 * space-joined, empty parts dropped — mirrors or-emb's `Item.text_for_variant`
 * for `"full"`. Truncated to MAX_EMBEDDING_CHARS as a safety net.
 */
export function buildEmbeddingText(q: EmbeddableQuestion): string {
  const options = (q.answerOptions as AnswerOption[] | null) ?? [];
  const parts = [q.stimulus ?? "", q.stem, ...options.map((o) => o.content)]
    .map(htmlToPlainText)
    .filter((p) => p.length > 0);
  const text = parts.join(" ");
  return text.length > MAX_EMBEDDING_CHARS ? text.slice(0, MAX_EMBEDDING_CHARS) : text;
}

/** Own provider construction — deliberately not shared with hint-provider.ts (see file comment). */
export function getEmbeddingModel(modelId: string = embeddingModelId()) {
  if (embeddingProvider() === "ollama") {
    return createOllamaProvider().embeddingModel(modelId.replace(/^ollama\//, ""));
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set.");
  const openrouter = createOpenRouter({ apiKey });
  return openrouter.textEmbeddingModel(modelId);
}

/** In-place L2-normalize a vector. Never assume a provider already returns unit vectors. */
export function l2Normalize(vec: Float32Array): Float32Array {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) sumSq += vec[i] * vec[i];
  const norm = Math.sqrt(sumSq);
  if (norm === 0 || !Number.isFinite(norm)) return vec;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

export function float32ToBytes(vec: Float32Array): Uint8Array {
  return new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength).slice();
}

/**
 * Decode bytea -> Float32Array by COPYING bytes into a fresh, aligned buffer.
 * A driver-returned Uint8Array/Buffer may start at a non-4-byte-aligned
 * offset into a shared pool — `new Float32Array(buf.buffer, buf.byteOffset, n)`
 * throws `RangeError: start offset ... is not a multiple of BYTES_PER_ELEMENT`
 * in that case. Copying sidesteps it entirely.
 */
export function bytesToFloat32(bytes: Uint8Array, dim: number): Float32Array {
  const out = new Float32Array(dim);
  new Uint8Array(out.buffer).set(bytes);
  return out;
}

export interface SimilarityHit {
  id: string;
  score: number;
}

/**
 * A flat, contiguous matrix of L2-normalized row vectors plus the id each row
 * belongs to — the whole in-process "index." Cosine similarity on unit
 * vectors is a plain dot product, so ranking the whole corpus against one
 * query is a single pass with no external index structure needed at this
 * corpus size (~3.8k rows).
 */
export class EmbeddingIndex {
  private readonly ids: readonly string[];
  private readonly rowOf: ReadonlyMap<string, number>;
  private readonly matrix: Float32Array; // n * dim, row-major
  private readonly dim: number;

  constructor(ids: readonly string[], matrix: Float32Array, dim: number) {
    this.ids = ids;
    this.matrix = matrix;
    this.dim = dim;
    this.rowOf = new Map(ids.map((id, i) => [id, i]));
  }

  get size(): number {
    return this.ids.length;
  }

  has(id: string): boolean {
    return this.rowOf.has(id);
  }

  /**
   * Shared linear scan: dot product of `query` against every row (unit
   * vectors ⇒ cosine = dot), keeping the top `limit` via a small array kept
   * min-first (re-sorted on each displacement — fine at limit ≤ ~200, a real
   * heap isn't worth the complexity here). `skipRow`, when given, excludes
   * that single row index (used by `topK` to exclude the query question
   * itself). `allow`, when given, restricts the scan to ids in that set —
   * needed by `topKForVector` so a query vector can be ranked against a
   * caller-chosen pool rather than the whole corpus.
   */
  private scan(
    query: Float32Array,
    limit: number,
    skipRow: number | null,
    allow: ReadonlySet<string> | null,
  ): SimilarityHit[] {
    const { matrix, dim, ids } = this;
    const heap: SimilarityHit[] = [];

    for (let i = 0; i < ids.length; i++) {
      if (i === skipRow) continue;
      if (allow !== null && !allow.has(ids[i])) continue;

      const otherBase = i * dim;
      let dot = 0;
      for (let d = 0; d < dim; d++) dot += query[d] * matrix[otherBase + d];

      if (heap.length < limit) {
        heap.push({ id: ids[i], score: dot });
        if (heap.length === limit) heap.sort((a, b) => a.score - b.score);
      } else if (heap.length > 0 && dot > heap[0].score) {
        heap[0] = { id: ids[i], score: dot };
        heap.sort((a, b) => a.score - b.score);
      }
    }

    return heap.sort((a, b) => b.score - a.score);
  }

  /** Top-`limit` most similar ids to `id`, excluding `id` itself, descending by score. */
  topK(id: string, limit: number): SimilarityHit[] {
    const row = this.rowOf.get(id);
    if (row === undefined) return [];
    const base = row * this.dim;
    return this.scan(this.matrix.subarray(base, base + this.dim), limit, row, null);
  }

  /**
   * Top-`limit` most similar ids to an arbitrary query vector (e.g. an
   * embedded free-text prompt), optionally restricted to `allow` — used by
   * "Smart select" to rank a prompt's embedding against just the ids that
   * already match a practice-set builder's filters, not the whole bank.
   * Throws if `query`'s dimension doesn't match the index's.
   */
  topKForVector(query: Float32Array, limit: number, allow?: ReadonlySet<string>): SimilarityHit[] {
    if (query.length !== this.dim) {
      throw new Error(`Query vector has dimension ${query.length}, expected ${this.dim}.`);
    }
    return this.scan(query, limit, null, allow ?? null);
  }
}

export interface EmbeddingRow {
  questionId: string;
  dim: number;
  vector: Uint8Array;
}

/** Build an EmbeddingIndex from raw DB rows — shared by similar-questions.ts and any offline smoke-test script. */
export function buildEmbeddingIndex(rows: readonly EmbeddingRow[]): EmbeddingIndex {
  if (rows.length === 0) return new EmbeddingIndex([], new Float32Array(0), EMBEDDING_DIM);
  const dim = rows[0].dim;
  const ids = rows.map((r) => r.questionId);
  const matrix = new Float32Array(rows.length * dim);
  for (let i = 0; i < rows.length; i++) {
    const vec = bytesToFloat32(rows[i].vector, dim);
    matrix.set(vec, i * dim);
  }
  return new EmbeddingIndex(ids, matrix, dim);
}
