// The exam state machine's phase vocabulary. Pure — no DB, no server-only —
// shared by server actions, RSC pages, and the client runner.
//
//   rw_1_directions -> rw_1_active -> rw_2_directions -> rw_2_active ->
//   break -> math_1_directions -> math_1_active -> math_2_directions ->
//   math_2_active -> completed
//
// A module's timer starts ONLY on an explicit startModule() call from its
// directions screen — never automatically. The break is identical: skipBreak()
// or the break's natural expiry both land on math_1_directions, never on
// math_1_active — per the user's decision that no timer auto-starts.
//
// Expiry ("time's up") is NOT a phase. It's derived at read time as
// `phase.endsWith('_active') && serverNow >= module.deadlineAt` — see
// src/lib/exam/state.ts. Writing it as a stored phase would require an RSC
// render to mutate state, which isn't safe (renders aren't guaranteed to
// run exactly once).

export const EXAM_PHASES = [
  "rw_1_directions",
  "rw_1_active",
  "rw_2_directions",
  "rw_2_active",
  "break",
  "math_1_directions",
  "math_1_active",
  "math_2_directions",
  "math_2_active",
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

/** Section + 1-indexed module number this active/directions phase belongs to, or null for 'break'/'completed'. */
export function phaseModule(phase: ExamPhase): { sectionCode: "RW" | "MATH"; moduleIndex: 1 | 2 } | null {
  switch (phase) {
    case "rw_1_directions":
    case "rw_1_active":
      return { sectionCode: "RW", moduleIndex: 1 };
    case "rw_2_directions":
    case "rw_2_active":
      return { sectionCode: "RW", moduleIndex: 2 };
    case "math_1_directions":
    case "math_1_active":
      return { sectionCode: "MATH", moduleIndex: 1 };
    case "math_2_directions":
    case "math_2_active":
      return { sectionCode: "MATH", moduleIndex: 2 };
    default:
      return null;
  }
}

/** The phase that follows submitting the module identified by `phase` (an *_active phase). */
export function nextPhaseAfterSubmit(phase: ExamPhase): ExamPhase {
  switch (phase) {
    case "rw_1_active":
      return "rw_2_directions";
    case "rw_2_active":
      return "break";
    case "math_1_active":
      return "math_2_directions";
    case "math_2_active":
      return "completed";
    default:
      throw new Error(`nextPhaseAfterSubmit called on non-active phase: ${phase}`);
  }
}

/** The *_active phase for a directions phase (startModule's target). */
export function activePhaseFor(phase: ExamPhase): ExamPhase {
  switch (phase) {
    case "rw_1_directions":
      return "rw_1_active";
    case "rw_2_directions":
      return "rw_2_active";
    case "math_1_directions":
      return "math_1_active";
    case "math_2_directions":
      return "math_2_active";
    default:
      throw new Error(`activePhaseFor called on non-directions phase: ${phase}`);
  }
}
