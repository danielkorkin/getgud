import type { ExamSectionCode } from "@/exams/spec";

// The exam state machine's phase vocabulary. Pure — no DB, no server-only —
// shared by server actions, RSC pages, and the client runner.
//
//   m1_directions -> m1_active -> m2_directions -> m2_active ->
//   break -> m3_directions -> m3_active -> m4_directions ->
//   m4_active -> completed
//
// Phases are slot-generic (module 1..4), not section-named: which physical
// section (RW/MATH) occupies slots 1-2 vs 3-4 is chosen by the student at
// start and stored as `ExamSession.sectionOrder`, a 2-element permutation of
// "RW"/"MATH". `phaseModule()` is the one place that resolves a slot to a
// section, via that stored order — every other function here (in particular
// `nextPhaseAfterSubmit`) is genuinely order-free.
//
// A module's timer starts ONLY on an explicit startModule() call from its
// directions screen — never automatically. The break is identical: skipBreak()
// or the break's natural expiry both land on m3_directions, never on
// m3_active — per the user's decision that no timer auto-starts.
//
// Expiry ("time's up") is NOT a phase. It's derived at read time as
// `phase.endsWith('_active') && serverNow >= module.deadlineAt` — see
// src/lib/exam/state.ts. Writing it as a stored phase would require an RSC
// render to mutate state, which isn't safe (renders aren't guaranteed to
// run exactly once).

export const EXAM_PHASES = [
  "m1_directions",
  "m1_active",
  "m2_directions",
  "m2_active",
  "break",
  "m3_directions",
  "m3_active",
  "m4_directions",
  "m4_active",
  "completed",
] as const;

export type ExamPhase = (typeof EXAM_PHASES)[number];

const PHASE_SET = new Set<string>(EXAM_PHASES);
export function isExamPhase(value: string): value is ExamPhase {
  return PHASE_SET.has(value);
}

export function isActivePhase(phase: ExamPhase): boolean {
  return phase.endsWith("_active");
}

export function isDirectionsPhase(phase: ExamPhase): boolean {
  return phase.endsWith("_directions");
}

/** True for the very last active module (whole-exam completion is computed here). */
export function isFinalActivePhase(phase: ExamPhase): boolean {
  return phase === "m4_active";
}

/** True right at the section-1/section-2 boundary — section 1 is done, section 2 hasn't started. */
export function isBetweenSections(phase: ExamPhase): boolean {
  return phase === "break" || phase === "m3_directions";
}

/** A 2-element permutation of "RW"/"MATH" — the runtime order a student chose at start. */
export function isSectionOrder(value: unknown): value is readonly [ExamSectionCode, ExamSectionCode] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    ((value[0] === "RW" && value[1] === "MATH") || (value[0] === "MATH" && value[1] === "RW"))
  );
}

/** Section + 1-indexed module number this active/directions phase belongs to, or null for 'break'/'completed'. */
export function phaseModule(
  phase: ExamPhase,
  sectionOrder: readonly [ExamSectionCode, ExamSectionCode],
): { sectionCode: ExamSectionCode; moduleIndex: 1 | 2 } | null {
  switch (phase) {
    case "m1_directions":
    case "m1_active":
      return { sectionCode: sectionOrder[0], moduleIndex: 1 };
    case "m2_directions":
    case "m2_active":
      return { sectionCode: sectionOrder[0], moduleIndex: 2 };
    case "m3_directions":
    case "m3_active":
      return { sectionCode: sectionOrder[1], moduleIndex: 1 };
    case "m4_directions":
    case "m4_active":
      return { sectionCode: sectionOrder[1], moduleIndex: 2 };
    default:
      return null;
  }
}

/** The phase that follows submitting the module identified by `phase` (an *_active phase). */
export function nextPhaseAfterSubmit(phase: ExamPhase): ExamPhase {
  switch (phase) {
    case "m1_active":
      return "m2_directions";
    case "m2_active":
      return "break";
    case "m3_active":
      return "m4_directions";
    case "m4_active":
      return "completed";
    default:
      throw new Error(`nextPhaseAfterSubmit called on non-active phase: ${phase}`);
  }
}

/** The *_active phase for a directions phase (startModule's target). */
export function activePhaseFor(phase: ExamPhase): ExamPhase {
  switch (phase) {
    case "m1_directions":
      return "m1_active";
    case "m2_directions":
      return "m2_active";
    case "m3_directions":
      return "m3_active";
    case "m4_directions":
      return "m4_active";
    default:
      throw new Error(`activePhaseFor called on non-directions phase: ${phase}`);
  }
}
