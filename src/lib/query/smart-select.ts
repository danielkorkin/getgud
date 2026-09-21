// "Smart select" — AI-assisted question search inside the /new set builder.
// Given a free-text description (e.g. "passages that are poems with
// figurative language", "semicolon joining two independent clauses"), finds
// questions matching it WITHIN whatever filters the student already chose,
// using this app's existing per-question embeddings (pnpm embed) plus an
// LLM re-rank pass, and returns picks with a one-line reason each for the
// student to review before building a set from them.
//
// Pipeline: listMatchingQuestions (the filtered pool, no LIMIT) -> if the
// pool already fits within the re-rank budget, skip retrieval and re-rank
// the whole pool; otherwise embed the prompt and use rankByVector to narrow
// the pool down to a manageable candidate list -> hydrate candidate content
// -> one generateObject call re-ranks/selects among the candidates -> map
// indices back to question ids, dropping anything out of range.
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
import { listMatchingQuestions, type SetFilters, type SampledQuestion } from "@/lib/query/generate-set";
import { rankByVector, rerankCandidateCount } from "@/lib/query/similar-questions";

// Tighter than question-details.ts's AI-analysis budget (900/400/200) since
// up to ~120 candidates go into one prompt here, not a couple dozen.
const STIMULUS_MAX_CHARS = 700;
const STEM_MAX_CHARS = 300;
const OPTION_MAX_CHARS = 120;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
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
  /** Short plain-text preview (stimulus if present, else the stem) for the picker UI. */
  preview: string;
}

export type SmartSelectOutcome =
  | { picks: SmartCandidate[]; note: string; poolSize: number }
  | { error: string };

const PREVIEW_MAX_CHARS = 180;

export async function smartSelectQuestions(
  filters: SetFilters,
  profileId: string,
  userPrompt: string,
): Promise<SmartSelectOutcome> {
  const pool = await listMatchingQuestions(filters, profileId);
  if (pool.length === 0) {
    return { error: "No questions match your current filters — widen them before searching." };
  }

  const candidateCap = rerankCandidateCount(filters.questionCount);
  let poolForRerank: SampledQuestion[];
  if (pool.length <= candidateCap) {
    // Filters are already narrow enough that re-ranking the whole pool costs
    // about the same as retrieving a subset of it — skip the embed call.
    poolForRerank = pool;
  } else {
    const { embedding } = await embed({ model: getEmbeddingModel(), value: userPrompt });
    const queryVector = l2Normalize(Float32Array.from(embedding));
    const poolIds = new Set(pool.map((q) => q.questionId));
    const hits = await rankByVector(queryVector, poolIds, candidateCap);
    if (hits.length === 0) {
      // No embeddings for this pool at all (shouldn't happen once /new
      // gates this feature behind similarSearchAvailable(), but fail safe
      // rather than silently re-ranking the entire pool unfiltered).
      return { error: "No embedded questions found for these filters — try `pnpm embed` or widen your filters." };
    }
    const byId = new Map(pool.map((q) => [q.questionId, q]));
    poolForRerank = hits.map((h) => byId.get(h.id)).filter((q): q is SampledQuestion => q !== undefined);
  }

  const questionIds = poolForRerank.map((q) => q.questionId);
  const questions = await db.orm.public.Question.select("id", "stem", "stimulus", "answerOptions")
    .where((q) => q.id.in(questionIds))
    .all();
  const contentById = new Map(questions.map((q) => [q.id, q]));

  const candidateInputs: SmartSelectCandidateInput[] = [];
  const metaByIndex = new Map<number, SampledQuestion>();
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

  const { system, prompt } = buildRerankPrompt(userPrompt, candidateInputs, filters.questionCount);
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
      preview: truncate(candidate.stimulus ?? candidate.stem, PREVIEW_MAX_CHARS),
    });
    if (picks.length >= filters.questionCount) break;
  }

  return { picks, note: result.note, poolSize: pool.length };
}
