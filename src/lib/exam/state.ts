import "server-only";

import { db } from "@/prisma/db";
import { requireProfileId } from "@/lib/profile";
import { getExam } from "@/exams";
import type { ExamBlueprint, ExamSectionCode, Variant } from "@/exams/spec";
import { isExamPhase, isSectionOrder, phaseModule, type ExamPhase } from "./phases";

const DEFAULT_SECTION_ORDER: readonly [ExamSectionCode, ExamSectionCode] = ["RW", "MATH"];

export interface ExamStateModule {
  id: string;
  sectionCode: "RW" | "MATH";
  moduleIndex: 1 | 2;
  variant: Variant | null;
  status: "pending" | "active" | "submitted";
  startPosition: number;
  itemCount: number;
  minutes: number;
  startedAt: string | null;
  deadlineAt: string | null;
  submittedAt: string | null;
}

export interface ExamState {
  sessionId: string;
  examId: string;
  blueprint: ExamBlueprint;
  phase: ExamPhase;
  sectionOrder: readonly [ExamSectionCode, ExamSectionCode];
  splitSitting: boolean;
  serverNow: string;
  modules: ExamStateModule[];
  set: { id: string; name: string; questionCount: number; currentIndex: number; status: string };
  breakStartedAt: string | null;
  breakEndsAt: string | null;
  scores: {
    rwVariant: Variant;
    rwRaw: number;
    rwScaled: number;
    mathVariant: Variant;
    mathRaw: number;
    mathScaled: number;
    totalScaled: number;
  } | null;
  /** Per-section score, available as soon as that section's own two modules are submitted — independent of the other section. */
  sectionScores: Partial<Record<ExamSectionCode, { variant: Variant; raw: number; scaled: number }>>;
}

/** Loads everything a `/tests/[sessionId]` render needs, scoped to the current profile. Returns null if not found/not owned/not an exam set. */
export async function loadExamState(sessionId: string): Promise<ExamState | null> {
  const profileId = await requireProfileId();
  const set = await db.orm.public.PracticeSet.first({ id: sessionId, profileId });
  if (!set || set.mode !== "exam") return null;

  const session = await db.orm.public.ExamSession.first({ id: sessionId, profileId });
  if (!session) return null;

  const blueprint = getExam(session.examId);
  if (!blueprint) return null; // examId is fixed at creation time against the registry; a missing blueprint means it was removed from the registry since

  const modules = await db.orm.public.ExamModule.where({ sessionId }).all();

  const scores =
    session.rwVariant && session.mathVariant && session.rwRaw !== null && session.rwScaled !== null &&
    session.mathRaw !== null && session.mathScaled !== null && session.totalScaled !== null
      ? {
          rwVariant: session.rwVariant as Variant,
          rwRaw: session.rwRaw,
          rwScaled: session.rwScaled,
          mathVariant: session.mathVariant as Variant,
          mathRaw: session.mathRaw,
          mathScaled: session.mathScaled,
          totalScaled: session.totalScaled,
        }
      : null;

  const sectionScores: ExamState["sectionScores"] = {};
  if (session.rwVariant && session.rwRaw !== null && session.rwScaled !== null) {
    sectionScores.RW = { variant: session.rwVariant as Variant, raw: session.rwRaw, scaled: session.rwScaled };
  }
  if (session.mathVariant && session.mathRaw !== null && session.mathScaled !== null) {
    sectionScores.MATH = { variant: session.mathVariant as Variant, raw: session.mathRaw, scaled: session.mathScaled };
  }

  return {
    sessionId,
    examId: session.examId,
    blueprint,
    phase: isExamPhase(session.phase) ? session.phase : "m1_directions",
    sectionOrder: isSectionOrder(session.sectionOrder) ? session.sectionOrder : DEFAULT_SECTION_ORDER,
    splitSitting: session.splitSitting,
    serverNow: new Date().toISOString(),
    modules: modules.map((m) => ({
      id: m.id,
      sectionCode: m.sectionCode as "RW" | "MATH",
      moduleIndex: m.moduleIndex as 1 | 2,
      variant: (m.variant as Variant | null) ?? null,
      status: m.status as "pending" | "active" | "submitted",
      startPosition: m.startPosition,
      itemCount: m.itemCount,
      minutes: m.minutes,
      startedAt: m.startedAt,
      deadlineAt: m.deadlineAt,
      submittedAt: m.submittedAt,
    })),
    set: { id: set.id, name: set.name, questionCount: set.questionCount, currentIndex: set.currentIndex, status: set.status },
    breakStartedAt: session.breakStartedAt,
    breakEndsAt: session.breakEndsAt,
    scores,
    sectionScores,
  };
}

/** The module for the session's current phase (null for 'break'/'completed'). */
export function currentModule(state: ExamState): ExamStateModule | null {
  const target = phaseModule(state.phase, state.sectionOrder);
  if (!target) return null;
  return state.modules.find((m) => m.sectionCode === target.sectionCode && m.moduleIndex === target.moduleIndex) ?? null;
}

/** True when the current phase is an *_active module whose deadline has passed. Derived, never stored — see phases.ts's file comment. */
export function isModuleExpired(state: ExamState): boolean {
  if (!state.phase.endsWith("_active")) return false;
  const mod = currentModule(state);
  if (!mod?.deadlineAt) return false;
  return new Date(state.serverNow).getTime() >= new Date(mod.deadlineAt).getTime();
}

/** True when the break is showing but its countdown has run out (still lands the student on directions, never auto-starts math). */
export function isBreakExpired(state: ExamState): boolean {
  if (state.phase !== "break" || !state.breakEndsAt) return false;
  return new Date(state.serverNow).getTime() >= new Date(state.breakEndsAt).getTime();
}
