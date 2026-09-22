// "Smart select" — AI-assisted question search. Given a free-text
// description (e.g. "passages that are poems with figurative language",
// "semicolon joining two independent clauses"), finds questions matching it
// WITHIN whatever pool of candidates the caller has already filtered to,
// using this app's existing per-question embeddings (pnpm embed) plus an
// LLM re-rank pass, and returns picks with a one-line reason each.
//
// Two callers, two pools, one shared core (`smartSelectFromPool` below):
// - src/actions/sets.ts's `smartSelect` (the /new set builder) — pool from
//   generate-set.ts's `listMatchingQuestions`, which applies /new's
//   stricter policy (reserved-exam ids excluded, ungradable excluded).
// - src/actions/sets.ts's `smartSearchProblems` (the /problems library) —
//   pool from browse-questions.ts's `listMatchingBrowseQuestions`, which
//   applies /problems' own lenient policy (both of those included) — see
//   "Two filters ... deliberately NOT inherited" in CLAUDE.md's "Problems
//   database" section. This is why the pool type here carries its own
//   `gradable` flag rather than assuming every candidate is gradable the
//   way /new's pool always is.
//
// Pipeline: given the pool (no LIMIT) -> if it already fits within the
// re-rank budget, skip retrieval and re-rank the whole pool; otherwise embed
// the prompt and use rankByVector to narrow the pool down to a manageable
// candidate list -> hydrate candidate content -> one generateObject call
// re-ranks/selects among the candidates -> map indices back to question
// ids, dropping anything out of range.
//
// NOT HyDE: an earlier version embedded an LLM-written synthetic exemplar
// passage instead of the user's own prompt text (a step run and measured in
// scripts/probe-hyde.ts before this was written). That was dropped after
// measurement showed it was no better on prompts embeddings already handled
// well, and outright wrong twice — on Reading & Writing style/register
// prompts ("Shakespearean English", "semicolon joining two independent
// clauses"), the synthetic exemplar's embedding spuriously collided with
// bare Math equations at a HIGHER cosine than any genuine match. Embedding
// the user's own prompt directly never showed that failure across 6 test
// prompts spanning both sections. See scripts/probe-hyde.ts's file comment
// for the full record.
import "server-only";

import { embed, generateObject } from "ai";
import { db } from "@/prisma/db";
import { getAnalysisModel } from "@/lib/ai/hint-provider";
import { getEmbeddingModel, l2Normalize } from "@/lib/embeddings/core";
import { buildRerankPrompt, type SmartSelectCandidateInput } from "@/lib/ai/smart-select-prompt";
import { smartSelectionSchema } from "@/lib/ai/smart-select-schema";
import { toPlainText } from "@/lib/content/plain-text";
import { domainLabel, skillLabel } from "@/lib/catalog";
import type { AnswerOption } from "@/lib/grading";
import { listMatchingQuestions, type SetFilters } from "@/lib/query/generate-set";
import { rankByVector, rerankCandidateCount } from "@/lib/query/similar-questions";

// Tighter than question-details.ts's AI-analysis budget (900/400/200) since
// up to ~120 candidates go into one prompt here, not a couple dozen.
const STIMULUS_MAX_CHARS = 700;
const STEM_MAX_CHARS = 300;
const OPTION_MAX_CHARS = 120;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

/**
 * Caller-agnostic candidate pool shape — deliberately NOT generate-set.ts's
 * `SampledQuestion` (which has no `gradable` field, since /new's pool is
 * already SQL-filtered to gradable-only questions and doesn't need one).
 * /problems' pool includes ungradable questions too, so this core function
 * needs every candidate to say so explicitly rather than assuming it.
 */
export interface SmartPoolQuestion {
  questionId: string;
  sectionCode: string;
  domainCode: string;
  skillCode: string;
  difficulty: string;
  type: string;
  gradable: boolean;
}

export interface SmartCandidate {
  questionId: string;
  rank: number;
  reason: string;
  sectionCode: string;
  domainCode: string;
  skillCode: string;
  difficulty: string;
  type: string;
  gradable: boolean;
  /** Short plain-text preview (stimulus if present, else the stem) for the picker UI. */
  preview: string;
}

export type SmartSelectOutcome = { picks: SmartCandidate[]; note: string } | { error: string };

const PREVIEW_MAX_CHARS = 180;

/**
 * The shared core: given an already-filtered pool (no LIMIT applied) and a
 * free-text prompt, return up to `requestedCount` genuine matches with a
 * reason each. Never pads with weak matches — see smart-select-prompt.ts's
 * system rules and the caller-facing `note` field for the honest-shortfall
 * behavior.
 */
export async function smartSelectFromPool(
  pool: SmartPoolQuestion[],
  userPrompt: string,
  requestedCount: number,
): Promise<SmartSelectOutcome> {
  if (pool.length === 0) {
    return { error: "No questions match your current filters — widen them before searching." };
  }

  const candidateCap = rerankCandidateCount(requestedCount);
  let poolForRerank: SmartPoolQuestion[];
  if (pool.length <= candidateCap) {
    // Filters are already narrow enough that re-ranking the whole pool costs
    // about the same as retrieving a subset of it — skip the embed call.
    poolForRerank = pool;
  } else {
    let hits;
    try {
      const { embedding } = await embed({ model: getEmbeddingModel(), value: userPrompt });
      const queryVector = l2Normalize(Float32Array.from(embedding));
      const poolIds = new Set(pool.map((q) => q.questionId));
      hits = await rankByVector(queryVector, poolIds, candidateCap);
    } catch (e) {
      // Same graceful-failure contract as the generateObject call below —
      // an OpenRouter hiccup on the embedding request (or, in principle, a
      // dimension mismatch from topKForVector if the embedding model ever
      // changes) shouldn't surface as an unhandled exception out of a
      // Server Action.
      return { error: e instanceof Error ? e.message : "Smart select failed while searching — try again." };
    }
    if (hits.length === 0) {
      // No embeddings for this pool at all (shouldn't happen once callers
      // gate this feature behind similarSearchAvailable(), but fail safe
      // rather than silently re-ranking the entire pool unfiltered).
      return { error: "No embedded questions found for these filters — try `pnpm embed` or widen your filters." };
    }
    const byId = new Map(pool.map((q) => [q.questionId, q]));
    poolForRerank = hits.map((h) => byId.get(h.id)).filter((q): q is SmartPoolQuestion => q !== undefined);
  }

  const questionIds = poolForRerank.map((q) => q.questionId);
  const questions = await db.orm.public.Question.select("id", "stem", "stimulus", "answerOptions")
    .where((q) => q.id.in(questionIds))
    .all();
  const contentById = new Map(questions.map((q) => [q.id, q]));

  const candidateInputs: SmartSelectCandidateInput[] = [];
  const metaByIndex = new Map<number, SmartPoolQuestion>();
  for (const [i, q] of poolForRerank.entries()) {
    const content = contentById.get(q.questionId);
    if (!content) continue; // shouldn't happen — pool came from the same Question table
    const index = i + 1;
    const options = (content.answerOptions as AnswerOption[] | null) ?? null;
    candidateInputs.push({
      index,
      sectionCode: q.sectionCode,
      domainLabel: domainLabel(q.domainCode),
      skillLabel: skillLabel(q.skillCode),
      difficulty: q.difficulty,
      type: q.type,
      stimulus: content.stimulus ? truncate(toPlainText(content.stimulus), STIMULUS_MAX_CHARS) : null,
      stem: truncate(toPlainText(content.stem), STEM_MAX_CHARS),
      options: options ? options.map((o) => `${o.letter}. ${truncate(toPlainText(o.content), OPTION_MAX_CHARS)}`) : null,
    });
    metaByIndex.set(index, q);
  }

  if (candidateInputs.length === 0) {
    return { error: "Couldn't load content for any matching question — try again." };
  }

  const { system, prompt } = buildRerankPrompt(userPrompt, candidateInputs, requestedCount);
  let result;
  try {
    const { object } = await generateObject({
      model: getAnalysisModel(),
      schema: smartSelectionSchema(candidateInputs.length),
      system,
      prompt,
    });
    result = object;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Smart select failed — try again." };
  }

  const seen = new Set<number>();
  const picks: SmartCandidate[] = [];
  for (const pick of result.picks) {
    if (seen.has(pick.index)) continue; // a duplicate index — keep the first (best-ranked) occurrence only
    const meta = metaByIndex.get(pick.index);
    const candidate = candidateInputs.find((c) => c.index === pick.index);
    if (!meta || !candidate) continue; // out-of-range/hallucinated index — drop rather than trust
    seen.add(pick.index);

    picks.push({
      questionId: meta.questionId,
      rank: picks.length + 1,
      reason: pick.reason,
      sectionCode: meta.sectionCode,
      domainCode: meta.domainCode,
      skillCode: meta.skillCode,
      difficulty: meta.difficulty,
      type: meta.type,
      gradable: meta.gradable,
      preview: truncate(candidate.stimulus ?? candidate.stem, PREVIEW_MAX_CHARS),
    });
    if (picks.length >= requestedCount) break;
  }

  return { picks, note: result.note };
}

/** /new's caller: pool from generate-set.ts, which is already gradable-only. */
export async function smartSelectQuestions(
  filters: SetFilters,
  profileId: string,
  userPrompt: string,
): Promise<SmartSelectOutcome> {
  const pool = await listMatchingQuestions(filters, profileId);
  const poolQuestions: SmartPoolQuestion[] = pool.map((q) => ({
    questionId: q.questionId,
    sectionCode: q.sectionCode,
    domainCode: q.domainCode,
    skillCode: q.skillCode,
    difficulty: q.difficulty,
    type: q.type,
    gradable: true,
  }));
  return smartSelectFromPool(poolQuestions, userPrompt, filters.questionCount);
}
