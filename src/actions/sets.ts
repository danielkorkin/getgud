"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, param } from "@/prisma/db";
import { toJsonValue } from "@/lib/json";
import { requireProfileId } from "@/lib/profile";
import { isValidAssessment } from "@/lib/catalog";
import {
  countMatchingQuestions,
  listMatchingQuestions,
  sampleQuestions,
  validateSetFilters,
  type RawSetFilters,
  type SampledQuestion,
} from "@/lib/query/generate-set";
import { hintsConfigured } from "@/lib/ai/hint-provider";
import { similarSearchAvailable } from "@/lib/query/similar-questions";
import { smartSelectFromPool, smartSelectQuestions, type SmartCandidate, type SmartPoolQuestion } from "@/lib/query/smart-select";
import { listMatchingBrowseQuestions } from "@/lib/query/browse-questions";
import type { BrowseFilters } from "@/lib/query/browse-filters";

export async function countMatching(raw: RawSetFilters): Promise<{ count: number } | { error: string }> {
  const validated = validateSetFilters(raw);
  if (!validated.ok) return { error: validated.error };
  const profileId = raw.excludeAttempted ? await requireProfileId() : null;
  const count = await countMatchingQuestions(validated.filters, profileId);
  return { count };
}

function defaultSetName(raw: RawSetFilters): string {
  const sections = raw.sectionCodes.length === 1 ? raw.sectionCodes[0] : "Full";
  const difficulty = raw.difficulties.length === 1 ? raw.difficulties[0] : "Mixed";
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${raw.assessment} · ${sections} · ${difficulty} · ${date}`;
}

interface InsertPracticeSetInput {
  profileId: string;
  name: string;
  config: unknown;
  assessment: string;
  sectionCodes: string[];
  difficulties: string[];
  items: SampledQuestion[];
}

/**
 * Shared PracticeSet + PracticeSetItem insert, used by every "generate a set
 * from a resolved list of questions" path (createSet, createSmartSet). The
 * per-item facet snapshot is what /stats depends on (see contract.prisma's
 * comment above PracticeSetItem) — keeping this in one place is what stops
 * that snapshot from drifting between callers.
 */
async function insertPracticeSet(input: InsertPracticeSetInput): Promise<string> {
  const setId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.transaction(async (tx) => {
    await tx.orm.public.PracticeSet.create({
      id: setId,
      profileId: input.profileId,
      name: input.name,
      status: "in_progress",
      mode: "practice",
      config: toJsonValue(input.config),
      assessment: input.assessment,
      sectionCodes: input.sectionCodes,
      difficulties: input.difficulties,
      questionCount: input.items.length,
      currentIndex: 0,
      correctCount: 0,
      gradedCount: 0,
      totalActiveMs: 0,
      createdAt: now,
      startedAt: now,
    });

    for (const [index, q] of input.items.entries()) {
      await tx.orm.public.PracticeSetItem.create({
        id: crypto.randomUUID(),
        setId,
        position: index,
        questionId: q.questionId,
        assessment: input.assessment,
        sectionCode: q.sectionCode,
        domainCode: q.domainCode,
        skillCode: q.skillCode,
        difficulty: q.difficulty,
        scoreBand: q.scoreBand,
        type: q.type,
        gradable: true,
      });
    }
  });

  return setId;
}

export async function createSet(
  raw: RawSetFilters,
  name?: string,
): Promise<{ error: string } | void> {
  const validated = validateSetFilters(raw);
  if (!validated.ok) return { error: validated.error };
  const filters = validated.filters;

  const profileId = await requireProfileId();
  const sampled = await sampleQuestions(filters, filters.excludeAttempted ? profileId : null);
  if (sampled.length === 0) {
    return { error: "No questions match these filters. Try widening them." };
  }

  const setId = await insertPracticeSet({
    profileId,
    name: (name ?? "").trim() || defaultSetName(raw),
    config: filters,
    assessment: filters.assessment,
    sectionCodes: filters.sectionCodes,
    difficulties: filters.difficulties,
    items: sampled,
  });

  redirect(`/sets/${setId}`);
}

// ─── Smart select (AI-assisted question search, src/lib/query/smart-select.ts) ─
// A free-text description ("passages that are poems with figurative
// language") searched for within the builder's existing filters, using this
// app's embeddings plus one LLM re-rank call. Two actions: `smartSelect`
// finds candidates for the preview list (nothing is written), and
// `createSmartSet` builds the set from whichever picks the student kept.

const MAX_PROMPT_CHARS = 500;

export async function smartSelect(
  raw: RawSetFilters,
  prompt: string,
): Promise<{ picks: SmartCandidate[]; note: string } | { error: string }> {
  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt.length === 0) return { error: "Describe what you're looking for first." };
  if (trimmedPrompt.length > MAX_PROMPT_CHARS) {
    return { error: `Keep the description under ${MAX_PROMPT_CHARS} characters.` };
  }

  const validated = validateSetFilters(raw);
  if (!validated.ok) return { error: validated.error };

  if (!hintsConfigured()) {
    return { error: "Smart select isn't configured — set OPENROUTER_API_KEY to enable it." };
  }
  if (!(await similarSearchAvailable())) {
    return { error: "Smart select needs question embeddings — run `pnpm embed` first." };
  }

  const profileId = await requireProfileId();
  const result = await smartSelectQuestions(validated.filters, profileId, trimmedPrompt);
  if ("error" in result) return result;
  return { picks: result.picks, note: result.note };
}

function defaultSmartSetName(prompt: string): string {
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const trimmed = prompt.length > 40 ? prompt.slice(0, 40) + "…" : prompt;
  return `Smart · ${trimmed} · ${date}`;
}

export async function createSmartSet(
  raw: RawSetFilters,
  prompt: string,
  questionIds: string[],
  name?: string,
): Promise<{ error: string } | void> {
  const validated = validateSetFilters(raw);
  if (!validated.ok) return { error: validated.error };
  const filters = validated.filters;

  const profileId = await requireProfileId();

  // Re-derive the pool server-side rather than trusting the client's id
  // list — the same rule getOwnedItem enforces elsewhere ("no password
  // profiles are still not no authorization"), and it also protects against
  // a stale preview building a set with a question the current filters no
  // longer match.
  const pool = await listMatchingQuestions(filters, filters.excludeAttempted ? profileId : null);
  const poolById = new Map(pool.map((q) => [q.questionId, q]));

  const uniqueIncoming = [...new Set(questionIds)];
  const items: SampledQuestion[] = [];
  for (const id of uniqueIncoming) {
    const q = poolById.get(id);
    if (q) items.push(q);
  }
  if (items.length === 0) {
    return { error: "None of the selected questions matched your current filters — search again." };
  }

  const setId = await insertPracticeSet({
    profileId,
    name: (name ?? "").trim() || defaultSmartSetName(prompt),
    config: { kind: "smart", prompt, filters },
    assessment: filters.assessment,
    sectionCodes: filters.sectionCodes,
    difficulties: filters.difficulties,
    items,
  });

  redirect(`/sets/${setId}`);
}

export async function abandonSet(setId: string): Promise<void> {
  const profileId = await requireProfileId();
  await db.orm.public.PracticeSet.where({ id: setId, profileId }).update({ status: "abandoned" });
  redirect("/sets");
}

// ─── Hand-picked sets (src/app/problems) ────────────────────────────────
// A set assembled question-by-question from the /problems browser, rather
// than sampled from filter criteria. Same PracticeSet/PracticeSetItem
// tables, mode always "practice" — getOwnedItem's default 'practice-only'
// policy and completeSet both reject anything else. `config: { kind:
// "manual" }` is how the /problems page recognizes a profile's existing
// drafts (see its page.tsx); this mirrors src/actions/exams.ts already
// storing a non-SetFilters shape (`{ examId }`) in the same Jsonb column.

function defaultManualSetName(): string {
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Hand-picked · ${date}`;
}

export async function createEmptySet(name: string, assessment: string): Promise<{ setId: string } | { error: string }> {
  if (!isValidAssessment(assessment)) return { error: `Unknown assessment: ${assessment}` };
  const profileId = await requireProfileId();

  const setId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.orm.public.PracticeSet.create({
    id: setId,
    profileId,
    name: name.trim() || defaultManualSetName(),
    status: "in_progress",
    mode: "practice",
    config: toJsonValue({ kind: "manual" }),
    assessment,
    sectionCodes: [],
    difficulties: [],
    questionCount: 0,
    currentIndex: 0,
    correctCount: 0,
    gradedCount: 0,
    totalActiveMs: 0,
    createdAt: now,
    startedAt: now,
  });

  revalidatePath("/problems");
  revalidatePath("/sets");
  return { setId };
}

interface ManualItemFacets {
  type: string;
  sectionCode: string;
  domainCode: string;
  skillCode: string;
  difficulty: string;
  scoreBand: number | null;
}

// Mirrors src/actions/exams.ts's private `fetchFacets` — given explicit
// question ids and a pinned assessment, resolve their question_assessment
// facets. Read-only, always run outside any db.transaction (same reasoning
// as that file's comment: transactions here only ever call tx.orm.*, never
// raw SQL).
async function fetchManualItemFacets(assessment: string, ids: readonly string[]): Promise<Map<string, ManualItemFacets>> {
  if (ids.length === 0) return new Map();
  const plan = db.raw.sql`
    SELECT
      q.id AS "questionId",
      q.type,
      qa."sectionCode",
      qa."domainCode",
      qa."skillCode",
      qa.difficulty,
      qa."scoreBand"
    FROM question q
    JOIN question_assessment qa ON qa."questionId" = q.id AND qa.assessment = ${assessment}
    WHERE q.id = ANY(${param([...ids], { codecId: "pg/text@1" })})
  `
    .returnsRow({
      questionId: "pg/text@1",
      type: "pg/text@1",
      sectionCode: "pg/text@1",
      domainCode: "pg/text@1",
      skillCode: "pg/text@1",
      difficulty: "pg/text@1",
      scoreBand: "pg/int4@1",
    })
    .build();
  const rows = await db.runtime().query(plan);
  return new Map(
    rows.map((r) => [
      r.questionId,
      { type: r.type, sectionCode: r.sectionCode, domainCode: r.domainCode, skillCode: r.skillCode, difficulty: r.difficulty, scoreBand: r.scoreBand },
    ]),
  );
}

export async function addQuestionsToSet(setId: string, questionIds: string[]): Promise<{ added: number } | { error: string }> {
  const profileId = await requireProfileId();
  const set = await db.orm.public.PracticeSet.first({ id: setId, profileId });
  if (!set) return { error: "Set not found." };
  if (set.mode !== "practice") return { error: "This action is not available for exam sets." };
  if (set.status !== "in_progress") return { error: "This set is no longer accepting questions." };

  const existingItems = await db.orm.public.PracticeSetItem.where({ setId }).all();
  const existingQuestionIds = new Set(existingItems.map((i) => i.questionId));
  const maxPosition = existingItems.reduce((max, i) => Math.max(max, i.position), -1);

  // No unique(setId, questionId) constraint exists on PracticeSetItem — this
  // is the only place duplicate prevention happens.
  const uniqueIncoming = [...new Set(questionIds)];
  const newIds = uniqueIncoming.filter((id) => !existingQuestionIds.has(id));
  if (newIds.length === 0) return { added: 0 };

  const [facets, questions] = await Promise.all([
    fetchManualItemFacets(set.assessment, newIds),
    db.orm.public.Question.where((q) => q.id.in(newIds)).all(),
  ]);
  const questionById = new Map(questions.map((q) => [q.id, q]));

  const missingIds = newIds.filter((id) => !facets.has(id) || !questionById.has(id));
  if (missingIds.length > 0) {
    return {
      error: `${missingIds.length} question${missingIds.length === 1 ? "" : "s"} could not be found for ${set.assessment} — check they're placed on this assessment.`,
    };
  }
  // Same definition src/lib/grading.ts's gradeAnswer uses: correctKeys.length > 0.
  const ungradableIds = newIds.filter((id) => (questionById.get(id)?.correctKeys.length ?? 0) === 0);
  if (ungradableIds.length > 0) {
    return {
      error: `${ungradableIds.length} question${ungradableIds.length === 1 ? "" : "s"} have no published answer and can't be added.`,
    };
  }

  await db.transaction(async (tx) => {
    for (const [i, id] of newIds.entries()) {
      const f = facets.get(id)!;
      await tx.orm.public.PracticeSetItem.create({
        id: crypto.randomUUID(),
        setId,
        // Append only — never insert mid-sequence. Existing Attempt rows
        // key off item id, and @@unique([setId, position]) would collide
        // with anything but a fresh position past the current end.
        position: maxPosition + 1 + i,
        questionId: id,
        assessment: set.assessment,
        sectionCode: f.sectionCode,
        domainCode: f.domainCode,
        skillCode: f.skillCode,
        difficulty: f.difficulty,
        scoreBand: f.scoreBand,
        type: f.type,
        gradable: true,
      });
    }

    // Refresh the denormalized facet-summary columns /sets' card
    // description reads, to the union across every item (old + new).
    const sectionCodes = new Set([...set.sectionCodes, ...newIds.map((id) => facets.get(id)!.sectionCode)]);
    const difficulties = new Set([...set.difficulties, ...newIds.map((id) => facets.get(id)!.difficulty)]);
    await tx.orm.public.PracticeSet.where({ id: setId }).update({
      questionCount: set.questionCount + newIds.length,
      sectionCodes: [...sectionCodes],
      difficulties: [...difficulties],
    });
  });

  revalidatePath("/problems");
  revalidatePath("/sets");
  return { added: newIds.length };
}

export async function removeQuestionFromSet(setId: string, questionId: string): Promise<{ ok: true } | { error: string }> {
  const profileId = await requireProfileId();
  const set = await db.orm.public.PracticeSet.first({ id: setId, profileId });
  if (!set) return { error: "Set not found." };
  if (set.mode !== "practice") return { error: "This action is not available for exam sets." };
  if (set.status !== "in_progress") return { error: "This set is no longer editable." };

  // Removing after an attempt has been graded would let a student
  // retroactively edit a set they've already started answering — refuse
  // rather than silently corrupting the attempt/stats history.
  const answeredAttempts = await db.orm.public.Attempt.where({ setId, status: "answered" }).all();
  if (answeredAttempts.length > 0) {
    return { error: "This set already has answered questions — abandon it and rebuild instead of removing one now." };
  }

  const items = await db.orm.public.PracticeSetItem.where({ setId }).orderBy((i) => i.position.asc()).all();
  const target = items.find((i) => i.questionId === questionId);
  if (!target) return { error: "That question isn't in this set." };
  const survivors = items.filter((i) => i.id !== target.id);

  await db.transaction(async (tx) => {
    await tx.orm.public.PracticeSetItem.where({ id: target.id }).delete();

    // Renumber the survivors to 0..n-1 in ascending position order — every
    // position only ever decreases, so each target slot was already
    // vacated by the deletion or a prior iteration of this loop, and
    // @@unique([setId, position]) never trips mid-renumber.
    for (const [index, item] of survivors.entries()) {
      if (item.position !== index) {
        await tx.orm.public.PracticeSetItem.where({ id: item.id }).update({ position: index });
      }
    }

    const sectionCodes = new Set(survivors.map((i) => i.sectionCode));
    const difficulties = new Set(survivors.map((i) => i.difficulty));
    await tx.orm.public.PracticeSet.where({ id: setId }).update({
      questionCount: survivors.length,
      currentIndex: 0,
      sectionCodes: [...sectionCodes],
      difficulties: [...difficulties],
    });
  });

  revalidatePath("/problems");
  revalidatePath("/sets");
  return { ok: true };
}

// ─── Smart search (the /problems library's own copy of Smart select) ──────
// Same free-text-description-plus-embeddings-plus-LLM-re-rank engine as
// /new's `smartSelect` above (src/lib/query/smart-select.ts's shared
// `smartSelectFromPool`), searching within whatever facet/text/attempted
// filters are already active on /problems instead of a set-builder's
// SetFilters. Deliberately reuses /problems' own lenient pool
// (`listMatchingBrowseQuestions` — reserved-exam and ungradable questions
// included, not excluded like /new's pool) rather than generate-set.ts's,
// so a pick here can be ungradable — `smart-search-panel.tsx` flags that
// and disables adding it to a set, the same rule `addQuestionsToSet`
// already enforces (a batch containing one ungradable id is rejected
// wholesale).

// No length slider on /problems (this is a search, not a set-length
// choice) — a fixed cap close to BROWSE_PAGE_SIZE keeps the re-rank prompt
// and the results list roughly one "page" of matches.
const PROBLEMS_SMART_SEARCH_COUNT = 20;

export async function smartSearchProblems(
  filters: BrowseFilters,
  prompt: string,
): Promise<{ picks: SmartCandidate[]; note: string } | { error: string }> {
  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt.length === 0) return { error: "Describe what you're looking for first." };
  if (trimmedPrompt.length > MAX_PROMPT_CHARS) {
    return { error: `Keep the description under ${MAX_PROMPT_CHARS} characters.` };
  }

  if (!hintsConfigured()) {
    return { error: "Smart search isn't configured — set OPENROUTER_API_KEY to enable it." };
  }
  if (!(await similarSearchAvailable())) {
    return { error: "Smart search needs question embeddings — run `pnpm embed` first." };
  }

  const profileId = await requireProfileId();
  const pool = await listMatchingBrowseQuestions(filters, profileId);
  const poolQuestions: SmartPoolQuestion[] = pool.map((q) => ({
    questionId: q.questionId,
    sectionCode: q.sectionCode,
    domainCode: q.domainCode,
    skillCode: q.skillCode,
    difficulty: q.difficulty,
    type: q.type,
    gradable: q.gradable,
  }));

  const result = await smartSelectFromPool(poolQuestions, trimmedPrompt, PROBLEMS_SMART_SEARCH_COUNT);
  if ("error" in result) return result;
  return { picks: result.picks, note: result.note };
}
