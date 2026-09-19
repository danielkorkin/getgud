"use server";

import { redirect } from "next/navigation";
// `param` must come from `@/prisma/db`, not `@prisma/orm-postgres/relational-core`
// directly — see the comment in db.ts for why importing it straight from the
// package can hand `db.raw.sql` a `ParamRef` from a different Turbopack bundle.
import { db, param } from "@/prisma/db";
import { requireProfileId } from "@/lib/profile";
import { getOwnedItem } from "@/lib/access";
import { renderContentField } from "@/lib/content/render";
import { gradeAnswer, normalizeSprResponse, type AnswerOption } from "@/lib/grading";
import { toJsonValue } from "@/lib/json";
import { getExam, isExamVisible } from "@/exams";
import { routeVariant, scoreExam } from "@/exams/scoring";
import type { ExamBlueprint, SectionBlueprint, Variant } from "@/exams/spec";
import { checkExamAvailability } from "@/lib/exam/availability";
import { modulePositions, totalQuestionCount } from "@/lib/exam/layout";
import {
  activePhaseFor,
  isDirectionsPhase,
  isExamPhase,
  nextPhaseAfterSubmit,
  phaseModule,
  type ExamPhase,
} from "@/lib/exam/phases";
import type { RenderedOption } from "@/actions/attempts";

// ─── Facet lookup ────────────────────────────────────────────────────────
// Mirrors src/lib/query/generate-set.ts's join, but keyed by an explicit id
// list (a blueprint's committed ids) instead of filter criteria. Read-only,
// so it's always run OUTSIDE any db.transaction — the transactions below
// only ever call tx.orm.* (matching src/actions/sets.ts's convention),
// never raw SQL, to sidestep any question about what a transaction handle
// exposes for the raw-SQL lane.

interface QuestionFacets {
  type: string;
  sectionCode: string;
  domainCode: string;
  skillCode: string;
  difficulty: string;
  scoreBand: number | null;
}

async function fetchFacets(assessment: string, ids: readonly string[]): Promise<Map<string, QuestionFacets>> {
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
  return new Map(rows.map((r) => [r.questionId, { type: r.type, sectionCode: r.sectionCode, domainCode: r.domainCode, skillCode: r.skillCode, difficulty: r.difficulty, scoreBand: r.scoreBand }]));
}

// ─── startExam ───────────────────────────────────────────────────────────

export async function startExam(examId: string): Promise<{ error: string } | never> {
  const profileId = await requireProfileId();
  const blueprint = getExam(examId);
  if (!blueprint || !isExamVisible(blueprint)) return { error: "Unknown exam." };

  const availability = await checkExamAvailability(blueprint);
  if (!availability.available) {
    return {
      error: `This instance is missing ${availability.missingIds.length} question(s) this test requires. Re-run \`pnpm scrape\` and \`pnpm load\` to fetch the full College Board question bank, then try again.`,
    };
  }

  const positions = modulePositions(blueprint);
  const rwModule1Pos = positions.find((p) => p.sectionCode === "RW" && p.moduleIndex === 1)!;
  const mathModule1Pos = positions.find((p) => p.sectionCode === "MATH" && p.moduleIndex === 1)!;
  const [rw, math] = blueprint.sections;

  const [rwFacets, mathFacets] = await Promise.all([
    fetchFacets(blueprint.assessment, rw.module1),
    fetchFacets(blueprint.assessment, math.module1),
  ]);

  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.transaction(async (tx) => {
    await tx.orm.public.PracticeSet.create({
      id: sessionId,
      profileId,
      name: blueprint.name,
      status: "in_progress",
      mode: "exam",
      config: toJsonValue({ examId }),
      assessment: blueprint.assessment,
      sectionCodes: ["RW", "MATH"],
      difficulties: [],
      questionCount: totalQuestionCount(blueprint),
      currentIndex: 0,
      correctCount: 0,
      gradedCount: 0,
      totalActiveMs: 0,
      createdAt: now,
    });

    await tx.orm.public.ExamSession.create({
      id: sessionId,
      setId: sessionId,
      profileId,
      examId,
      assessment: blueprint.assessment,
      phase: "rw_1_directions",
      createdAt: now,
    });

    for (const m of positions) {
      await tx.orm.public.ExamModule.create({
        id: crypto.randomUUID(),
        sessionId,
        sectionCode: m.sectionCode,
        moduleIndex: m.moduleIndex,
        variant: null,
        status: "pending",
        startPosition: m.startPosition,
        itemCount: m.itemCount,
        minutes: m.minutes,
        autoSubmitted: false,
      });
    }

    for (const [i, id] of rw.module1.entries()) {
      const f = rwFacets.get(id);
      if (!f) throw new Error(`Missing question_assessment facet for question ${id} (assessment=${blueprint.assessment}) — re-run the design script's --verify mode.`);
      await tx.orm.public.PracticeSetItem.create({
        id: crypto.randomUUID(),
        setId: sessionId,
        position: rwModule1Pos.startPosition + i,
        questionId: id,
        assessment: blueprint.assessment,
        sectionCode: f.sectionCode,
        domainCode: f.domainCode,
        skillCode: f.skillCode,
        difficulty: f.difficulty,
        scoreBand: f.scoreBand,
        type: f.type,
        gradable: true,
      });
    }
    for (const [i, id] of math.module1.entries()) {
      const f = mathFacets.get(id);
      if (!f) throw new Error(`Missing question_assessment facet for question ${id} (assessment=${blueprint.assessment}) — re-run the design script's --verify mode.`);
      await tx.orm.public.PracticeSetItem.create({
        id: crypto.randomUUID(),
        setId: sessionId,
        position: mathModule1Pos.startPosition + i,
        questionId: id,
        assessment: blueprint.assessment,
        sectionCode: f.sectionCode,
        domainCode: f.domainCode,
        skillCode: f.skillCode,
        difficulty: f.difficulty,
        scoreBand: f.scoreBand,
        type: f.type,
        gradable: true,
      });
    }
  });

  redirect(`/tests/${sessionId}`);
}

// ─── startModule ─────────────────────────────────────────────────────────

export interface StartModuleResult {
  phase: ExamPhase;
  deadlineAt: string | null;
  serverNow: string;
  startPosition: number;
  itemCount: number;
}

export async function startModule(sessionId: string): Promise<StartModuleResult> {
  const profileId = await requireProfileId();
  const set = await db.orm.public.PracticeSet.first({ id: sessionId, profileId });
  if (!set || set.mode !== "exam") throw new Error("Exam session not found.");
  const session = await db.orm.public.ExamSession.first({ id: sessionId, profileId });
  if (!session || !isExamPhase(session.phase)) throw new Error("Exam session not found.");

  const modulesNow = await db.orm.public.ExamModule.where({ sessionId }).all();

  if (!isDirectionsPhase(session.phase)) {
    // Idempotent: already active (or break/completed) — report current
    // state instead of restarting anything.
    const target = phaseModule(session.phase);
    const mod = target ? modulesNow.find((m) => m.sectionCode === target.sectionCode && m.moduleIndex === target.moduleIndex) : null;
    return {
      phase: session.phase,
      deadlineAt: mod?.deadlineAt ?? null,
      serverNow: new Date().toISOString(),
      startPosition: mod?.startPosition ?? 0,
      itemCount: mod?.itemCount ?? 0,
    };
  }

  const directionsPhase = session.phase;
  const activePhase = activePhaseFor(directionsPhase);
  const target = phaseModule(activePhase)!;
  const mod = modulesNow.find((m) => m.sectionCode === target.sectionCode && m.moduleIndex === target.moduleIndex);
  if (!mod) throw new Error("Exam module not found.");

  const nowIso = new Date().toISOString();
  const deadlineAt = new Date(Date.now() + mod.minutes * 60_000).toISOString();

  await db.transaction(async (tx) => {
    // Conditional update — only the first of two concurrent calls (e.g. a
    // double-click) actually claims the module and writes the deadline.
    const claimed = await tx.orm.public.ExamModule.where({ id: mod.id, status: "pending" }).update({
      status: "active",
      startedAt: nowIso,
      deadlineAt,
    });
    if (!claimed) return;
    await tx.orm.public.ExamSession.where({ id: sessionId, phase: directionsPhase }).update({
      phase: activePhase,
      startedAt: session.startedAt ?? nowIso,
    });
    await tx.orm.public.PracticeSet.where({ id: sessionId }).update({
      startedAt: set.startedAt ?? nowIso,
      currentIndex: mod.startPosition,
    });
  });

  const fresh = await db.orm.public.ExamModule.first({ id: mod.id });
  return {
    phase: activePhase,
    deadlineAt: fresh?.deadlineAt ?? deadlineAt,
    serverNow: nowIso,
    startPosition: mod.startPosition,
    itemCount: mod.itemCount,
  };
}

// ─── getExamItem ─────────────────────────────────────────────────────────
// Deliberately its own type, NOT practice's RenderedItemResult — no
// `feedback` field exists on it at all, and domainCode/skillCode/
// difficulty/scoreBand are omitted from the wire payload entirely (the
// practice header badges difficulty; shipping that to an exam client would
// both break immersion and leak a routing tell).

export interface ExamItemResult {
  module: { sectionCode: "RW" | "MATH"; moduleIndex: 1 | 2; numberInModule: number; itemCount: number; deadlineAt: string | null };
  serverNow: string;
  item: { id: string; questionId: string; position: number; type: "mcq" | "spr"; gradable: boolean };
  content: { stimulusHtml: string | null; stemHtml: string; options: RenderedOption[] | null };
  response: {
    selectedOptionId: string | null;
    spResponse: string | null;
    markedForReview: boolean;
    eliminatedOptionIds: readonly string[];
    notes: string | null;
    highlights: unknown;
  };
}

export async function getExamItem(sessionId: string, position: number): Promise<ExamItemResult> {
  const { profileId, set, item, question, examModule } = await getOwnedItem(sessionId, position, "exam-write");
  if (!examModule) throw new Error("Exam module not found.");
  const now = new Date().toISOString();

  let attempt = await db.orm.public.Attempt.first({ id: item.id });
  if (!attempt) {
    attempt = await db.orm.public.Attempt.create({
      id: item.id,
      itemId: item.id,
      setId: sessionId,
      profileId,
      questionId: question.id,
      assessment: item.assessment,
      sectionCode: item.sectionCode,
      domainCode: item.domainCode,
      skillCode: item.skillCode,
      difficulty: item.difficulty,
      scoreBand: item.scoreBand,
      type: item.type,
      contentSource: question.contentSource,
      status: "unanswered",
      gradable: item.gradable,
      firstViewedAt: now,
      visitCount: 1,
    });
  } else {
    attempt =
      (await db.orm.public.Attempt.where({ id: item.id }).update({
        firstViewedAt: attempt.firstViewedAt ?? now,
        visitCount: attempt.visitCount + 1,
      })) ?? attempt;
  }

  if (set.currentIndex !== position) {
    await db.orm.public.PracticeSet.where({ id: sessionId }).update({ currentIndex: position });
  }

  const options =
    (question.answerOptions as AnswerOption[] | null)?.map((o) => ({
      id: o.id,
      letter: o.letter,
      html: renderContentField({ html: o.content, contentHash: question.contentHash, field: `option:${o.id}` }),
    })) ?? null;

  return {
    module: {
      sectionCode: examModule.sectionCode as "RW" | "MATH",
      moduleIndex: examModule.moduleIndex as 1 | 2,
      numberInModule: position - examModule.startPosition + 1,
      itemCount: examModule.itemCount,
      deadlineAt: examModule.deadlineAt,
    },
    serverNow: now,
    item: { id: item.id, questionId: question.id, position: item.position, type: item.type as "mcq" | "spr", gradable: item.gradable },
    content: {
      stimulusHtml: question.stimulus ? renderContentField({ html: question.stimulus, contentHash: question.contentHash, field: "stimulus" }) : null,
      stemHtml: renderContentField({ html: question.stem, contentHash: question.contentHash, field: "stem" }),
      options,
    },
    response: {
      selectedOptionId: attempt.selectedOptionId,
      spResponse: attempt.spResponse,
      markedForReview: attempt.markedForReview,
      eliminatedOptionIds: attempt.eliminatedOptionIds,
      notes: attempt.notes,
      highlights: attempt.highlights,
    },
  };
}

// ─── saveExamResponse / clearExamResponse ────────────────────────────────
// Re-settable, and — unlike practice's submitAnswer — NEVER grades and
// NEVER writes isCorrect/submittedAt/the PracticeSet rollups. Grading only
// happens in bulk, in submitModule, when the module is submitted.

export interface SaveExamResponseInput {
  selectedOptionId?: string | null;
  spResponse?: string | null;
  timeToFirstInputMs?: number;
}

export async function saveExamResponse(
  sessionId: string,
  position: number,
  input: SaveExamResponseInput,
): Promise<{ ok: true } | { ok: false; reason: "expired" }> {
  let owned: Awaited<ReturnType<typeof getOwnedItem>>;
  try {
    owned = await getOwnedItem(sessionId, position, "exam-write");
  } catch {
    return { ok: false, reason: "expired" };
  }
  const { item, question } = owned;
  const attempt = await db.orm.public.Attempt.first({ id: item.id });
  if (!attempt) throw new Error("View the question before answering.");

  const options = question.answerOptions as AnswerOption[] | null;
  const selectedOption = options?.find((o) => o.id === input.selectedOptionId);
  const hasResponse = Boolean(input.selectedOptionId) || Boolean(input.spResponse && input.spResponse.trim() !== "");
  const now = new Date().toISOString();

  await db.orm.public.Attempt.where({ id: item.id }).update({
    status: hasResponse ? "answered" : "unanswered",
    selectedOptionId: input.selectedOptionId ?? null,
    selectedLetter: selectedOption?.letter ?? null,
    spResponse: input.spResponse ?? null,
    spNormalized: input.spResponse ? normalizeSprResponse(input.spResponse) : null,
    answerChangeCount: attempt.answerChangeCount + 1,
    firstInputAt: attempt.firstInputAt ?? now,
    timeToFirstInputMs: attempt.timeToFirstInputMs ?? input.timeToFirstInputMs ?? null,
  });

  return { ok: true };
}

export async function clearExamResponse(sessionId: string, position: number): Promise<void> {
  const { item } = await getOwnedItem(sessionId, position, "exam-write");
  await db.orm.public.Attempt.where({ id: item.id }).update({
    status: "unanswered",
    selectedOptionId: null,
    selectedLetter: null,
    spResponse: null,
    spNormalized: null,
  });
}

// ─── submitModule ────────────────────────────────────────────────────────

export async function submitModule(sessionId: string, opts?: { auto?: boolean }): Promise<{ phase: ExamPhase; routedVariant?: Variant }> {
  const profileId = await requireProfileId();
  const set = await db.orm.public.PracticeSet.first({ id: sessionId, profileId });
  if (!set || set.mode !== "exam") throw new Error("Exam session not found.");
  const sessionBefore = await db.orm.public.ExamSession.first({ id: sessionId, profileId });
  if (!sessionBefore || !isExamPhase(sessionBefore.phase)) throw new Error("Exam session not found.");

  if (!sessionBefore.phase.endsWith("_active")) {
    // Nothing to submit — either already advanced by a concurrent call
    // (the timer-expiry / reload-after-expiry race the plan calls out) or
    // called at a nonsensical time. Report current phase either way.
    return { phase: sessionBefore.phase };
  }

  const activePhase = sessionBefore.phase;
  const target = phaseModule(activePhase)!;
  const modulesBefore = await db.orm.public.ExamModule.where({ sessionId }).all();
  const mod = modulesBefore.find((m) => m.sectionCode === target.sectionCode && m.moduleIndex === target.moduleIndex);
  if (!mod) throw new Error("Exam module not found.");

  const blueprint = getExam(sessionBefore.examId);
  if (!blueprint) throw new Error(`Unknown exam id "${sessionBefore.examId}" referenced by session ${sessionId}.`);
  const sectionBlueprint = blueprint.sections.find((s) => s.sectionCode === target.sectionCode)!;

  // Facets for BOTH possible Module 2 variants are fetched up front (read-
  // only, no DB writes) so the transaction below only ever calls tx.orm.*
  // — never raw SQL — no matter which way routing goes.
  let routingFacets: { lower: Map<string, QuestionFacets>; upper: Map<string, QuestionFacets> } | null = null;
  if (target.moduleIndex === 1) {
    const [lower, upper] = await Promise.all([
      fetchFacets(blueprint.assessment, sectionBlueprint.module2Lower),
      fetchFacets(blueprint.assessment, sectionBlueprint.module2Upper),
    ]);
    routingFacets = { lower, upper };
  }

  const now = new Date().toISOString();
  let resultPhase: ExamPhase = activePhase;
  let routedVariant: Variant | undefined;

  await db.transaction(async (tx) => {
    // Conditional update is the atomicity guard: only one of two racing
    // calls (open-tab countdown vs. a reload landing on the expired-read
    // interstitial) actually claims the module and grades it.
    const claimed = await tx.orm.public.ExamModule.where({ id: mod.id, status: "active" }).update({
      status: "submitted",
      submittedAt: now,
      autoSubmitted: Boolean(opts?.auto),
    });
    if (!claimed) {
      const latest = await tx.orm.public.ExamSession.first({ id: sessionId });
      resultPhase = latest && isExamPhase(latest.phase) ? latest.phase : activePhase;
      return;
    }

    const items = await tx.orm.public.PracticeSetItem.where({ setId: sessionId }).all();
    const inRange = items.filter((it) => it.position >= mod.startPosition && it.position < mod.startPosition + mod.itemCount);

    let rawCorrect = 0;
    let answeredCount = 0;
    let gradedDelta = 0;
    let correctDelta = 0;

    for (const it of inRange) {
      const attempt = await tx.orm.public.Attempt.first({ id: it.id });
      const question = await tx.orm.public.Question.first({ id: it.questionId });
      if (!attempt || !question || attempt.status !== "answered") continue;
      answeredCount++;
      const { isCorrect, gradable } = gradeAnswer({
        type: it.type as "mcq" | "spr",
        correctKeys: question.correctKeys,
        selectedOptionId: attempt.selectedOptionId,
        spResponse: attempt.spResponse,
      });
      const totalMs = attempt.firstViewedAt ? Math.max(0, new Date(now).getTime() - new Date(attempt.firstViewedAt).getTime()) : attempt.totalMs;
      await tx.orm.public.Attempt.where({ id: it.id }).update({ isCorrect, gradable, submittedAt: now, totalMs });
      gradedDelta++;
      if (isCorrect) {
        rawCorrect++;
        correctDelta++;
      }
    }

    await tx.orm.public.ExamModule.where({ id: mod.id }).update({ rawCorrect, answeredCount });
    await tx.orm.public.PracticeSet.where({ id: sessionId }).update({
      gradedCount: set.gradedCount + gradedDelta,
      correctCount: set.correctCount + correctDelta,
    });

    const nextPhase = nextPhaseAfterSubmit(activePhase);
    resultPhase = nextPhase;

    if (target.moduleIndex === 1) {
      const variant = routeVariant(sectionBlueprint, rawCorrect);
      routedVariant = variant;
      const m2 = modulesBefore.find((m) => m.sectionCode === target.sectionCode && m.moduleIndex === 2)!;
      await tx.orm.public.ExamModule.where({ id: m2.id }).update({ variant });

      const ids = variant === "upper" ? sectionBlueprint.module2Upper : sectionBlueprint.module2Lower;
      const facets = variant === "upper" ? routingFacets!.upper : routingFacets!.lower;
      for (const [i, id] of ids.entries()) {
        const f = facets.get(id);
        if (!f) throw new Error(`Missing question_assessment facet for question ${id} (assessment=${blueprint.assessment}) — re-run the design script's --verify mode.`);
        await tx.orm.public.PracticeSetItem.create({
          id: crypto.randomUUID(),
          setId: sessionId,
          position: m2.startPosition + i,
          questionId: id,
          assessment: blueprint.assessment,
          sectionCode: f.sectionCode,
          domainCode: f.domainCode,
          skillCode: f.skillCode,
          difficulty: f.difficulty,
          scoreBand: f.scoreBand,
          type: f.type,
          gradable: true,
        });
      }
      await tx.orm.public.PracticeSet.where({ id: sessionId }).update({ currentIndex: m2.startPosition });
    }

    if (activePhase === "rw_2_active") {
      // Per the "nothing auto-starts" rule, the break's own countdown does
      // not begin here — breakStartedAt/breakEndsAt stay NULL until the
      // student explicitly starts it (see startBreak below). The break
      // screen itself has no timer to auto-start; only the module clocks
      // do, and this phase transition shows that screen, nothing more.
      await tx.orm.public.ExamSession.where({ id: sessionId }).update({ phase: nextPhase });
      return;
    }

    if (activePhase === "math_2_active") {
      const freshModules = await tx.orm.public.ExamModule.where({ sessionId }).all();
      const rw1 = freshModules.find((m) => m.sectionCode === "RW" && m.moduleIndex === 1)!;
      const rw2 = freshModules.find((m) => m.sectionCode === "RW" && m.moduleIndex === 2)!;
      const math1 = freshModules.find((m) => m.sectionCode === "MATH" && m.moduleIndex === 1)!;
      const math2 = freshModules.find((m) => m.sectionCode === "MATH" && m.moduleIndex === 2)!;
      const rwRaw = (rw1.rawCorrect ?? 0) + (rw2.rawCorrect ?? 0);
      const mathRaw = (math1.rawCorrect ?? 0) + (math2.rawCorrect ?? 0);
      const rwVariant = (rw2.variant as Variant) ?? "lower";
      const mathVariant = (math2.variant as Variant) ?? "lower";
      const scores = scoreExam(blueprint, { rwVariant, rwRaw, mathVariant, mathRaw });

      await tx.orm.public.ExamSession.where({ id: sessionId }).update({
        phase: "completed",
        rwVariant,
        rwRaw,
        rwScaled: scores.rwScaled,
        mathVariant,
        mathRaw,
        mathScaled: scores.mathScaled,
        totalScaled: scores.totalScaled,
        completedAt: now,
      });
      await tx.orm.public.PracticeSet.where({ id: sessionId }).update({ status: "completed", completedAt: now });
      return;
    }

    await tx.orm.public.ExamSession.where({ id: sessionId }).update({ phase: nextPhase });
  });

  return { phase: resultPhase, routedVariant };
}

// ─── startBreak / skipBreak / abandonExam ────────────────────────────────

/**
 * Starts the break's own countdown — per the user's decision, the 10-minute
 * timer does not begin automatically when Reading & Writing ends; it only
 * starts when the student presses a button on the break screen. Idempotent:
 * a second call while the break is already running returns the existing
 * deadline rather than resetting it.
 */
export async function startBreak(sessionId: string): Promise<{ breakStartedAt: string; breakEndsAt: string; serverNow: string }> {
  const profileId = await requireProfileId();
  const session = await db.orm.public.ExamSession.first({ id: sessionId, profileId });
  if (!session || session.phase !== "break") throw new Error("The break is not currently active.");

  const blueprint = getExam(session.examId);
  if (!blueprint) throw new Error(`Unknown exam id "${session.examId}".`);

  if (session.breakStartedAt && session.breakEndsAt) {
    return { breakStartedAt: session.breakStartedAt, breakEndsAt: session.breakEndsAt, serverNow: new Date().toISOString() };
  }

  const nowIso = new Date().toISOString();
  const breakEndsAt = new Date(Date.now() + blueprint.breakMinutes * 60_000).toISOString();
  const claimed = await db.orm.public.ExamSession.where({ id: sessionId, phase: "break", breakStartedAt: null }).update({
    breakStartedAt: nowIso,
    breakEndsAt,
  });
  return {
    breakStartedAt: claimed?.breakStartedAt ?? nowIso,
    breakEndsAt: claimed?.breakEndsAt ?? breakEndsAt,
    serverNow: nowIso,
  };
}

export async function skipBreak(sessionId: string): Promise<{ phase: ExamPhase }> {
  const profileId = await requireProfileId();
  const session = await db.orm.public.ExamSession.first({ id: sessionId, profileId });
  if (!session || !isExamPhase(session.phase)) throw new Error("Exam session not found.");
  if (session.phase !== "break") return { phase: session.phase };
  await db.orm.public.ExamSession.where({ id: sessionId, phase: "break" }).update({ phase: "math_1_directions" });
  return { phase: "math_1_directions" };
}

export async function abandonExam(sessionId: string): Promise<void> {
  const profileId = await requireProfileId();
  await db.orm.public.PracticeSet.where({ id: sessionId, profileId, mode: "exam" }).update({ status: "abandoned" });
  redirect("/tests");
}

export type { ExamBlueprint, SectionBlueprint, Variant };
