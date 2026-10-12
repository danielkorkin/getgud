// Types + validation for a premade exam blueprint. Deliberately dependency-
// free (no `server-only`, no `@/prisma/db`): this module is imported by a
// server-only lib (src/lib/exam/*), by RSC pages, and potentially by a
// client component (the /tests registry needs blueprint metadata like
// section minutes on the client). Pulling in DB code here would leak it
// into bundles that must never touch Postgres directly.
//
// A blueprint names College Board question ids directly (see the header
// comment in src/exams/index.ts for why that's stable across self-hosted
// instances) rather than a filter spec — that's what makes "the same test"
// a meaningful claim.

export type Variant = "lower" | "upper";
export type ExamSectionCode = "RW" | "MATH";

/** Design-time intent for one module — read by scripts/design-exam.ts, not by the runtime. */
export interface ModuleSpec {
  count: number;
  /** domainCode -> exact target count; must sum to `count`. */
  domainCounts: Record<string, number>;
  /** scoreBand (1-7) -> target count. Soft: shortfalls backfill from the nearest band. */
  bandCurve: Record<number, number>;
  /** MATH only — drawn from the same domain budget, placed near the tail (see layout.ts). Must be 0 for RW. */
  sprCount: number;
  /** Domain sequence used to lay out the committed id list. */
  domainOrder: string[];
}

export interface SectionBlueprint {
  sectionCode: ExamSectionCode;
  minutesPerModule: number;
  /**
   * Raw-correct-on-Module-1 threshold (>=) that routes to the `upper`
   * Module 2. A raw-count stand-in for College Board's IRT-theta routing —
   * see the file comment in src/exams/scoring.ts for why, and don't treat
   * it as claiming psychometric equivalence.
   */
  routingThreshold: number;
  module1: readonly string[];
  module2Lower: readonly string[];
  module2Upper: readonly string[];
  /**
   * raw total (Module 1 correct + Module 2 correct) -> scaled 200..800,
   * indexed 0..(module1.length + module2Lower.length). Two separate tables
   * because the lower path caps out well below 800 — see scoring.ts.
   */
  scaled: { lower: readonly number[]; upper: readonly number[] };
  /** Design-time intent per module — used by the selection script and its --verify mode. */
  spec: { module1: ModuleSpec; module2Lower: ModuleSpec; module2Upper: ModuleSpec };
}

/** The `question_assessment.assessment` value a blueprint draws its questions (and difficulty bands) from. */
export type ExamAssessment = "SAT" | "PSAT/NMSQT & PSAT 10";

export interface ExamBlueprint {
  id: string;
  name: string;
  assessment: ExamAssessment;
  /** Per-section scaled-score range — SAT 200-800, PSAT/NMSQT & PSAT 10 160-760. Total is twice this. */
  scale: { sectionMin: number; sectionMax: number };
  /** Excluded from /tests in production — see src/exams/sat-smoke.ts. */
  devOnly?: boolean;
  /** Minutes for the break between the RW section and the Math section. */
  breakMinutes: number;
  sections: readonly [SectionBlueprint, SectionBlueprint]; // [RW, MATH]
}

export function totalScaleMax(bp: Pick<ExamBlueprint, "scale">): number {
  return bp.scale.sectionMax * 2;
}

export function isPsat(bp: Pick<ExamBlueprint, "assessment">): boolean {
  return bp.assessment === "PSAT/NMSQT & PSAT 10";
}

/**
 * NMSC Selection Index for the junior-year PSAT/NMSQT: (2 x RW + Math) / 10,
 * 48-228 on the 160-760 section scale. Derived, never stored.
 */
export function nmscSelectionIndex(rwScaled: number, mathScaled: number): number {
  return Math.round((2 * rwScaled + mathScaled) / 10);
}

export interface ValidationIssue {
  path: string;
  message: string;
}

/**
 * Structural invariants a blueprint must satisfy to be safe to run. Does
 * NOT touch the database — see scripts/design-exam.ts's --verify mode for
 * the DB-backed checks (gradability, section match, dedup, etc).
 */
export function validateBlueprint(bp: ExamBlueprint): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const allIds = new Set<string>();
  const pushDup = (id: string, where: string) => {
    if (allIds.has(id)) issues.push({ path: where, message: `duplicate question id within exam: ${id}` });
    allIds.add(id);
  };

  for (const section of bp.sections) {
    const where = `sections.${section.sectionCode}`;

    // Load-bearing: fixes every module's startPosition at session-creation
    // time, so module-2 items can be appended after routing without
    // renumbering any already-created PracticeSetItem rows.
    if (section.module2Lower.length !== section.module2Upper.length) {
      issues.push({
        path: `${where}.module2`,
        message: `module2Lower.length (${section.module2Lower.length}) !== module2Upper.length (${section.module2Upper.length})`,
      });
    }

    const expectedTableLength = section.module1.length + section.module2Lower.length + 1;
    if (section.scaled.lower.length !== expectedTableLength) {
      issues.push({
        path: `${where}.scaled.lower`,
        message: `length ${section.scaled.lower.length} !== expected ${expectedTableLength}`,
      });
    }
    if (section.scaled.upper.length !== expectedTableLength) {
      issues.push({
        path: `${where}.scaled.upper`,
        message: `length ${section.scaled.upper.length} !== expected ${expectedTableLength}`,
      });
    }

    for (const [key, table] of [
      ["lower", section.scaled.lower],
      ["upper", section.scaled.upper],
    ] as const) {
      for (let i = 0; i < table.length; i++) {
        const v = table[i]!;
        if (v < bp.scale.sectionMin || v > bp.scale.sectionMax) {
          issues.push({ path: `${where}.scaled.${key}[${i}]`, message: `${v} outside scale ${bp.scale.sectionMin}-${bp.scale.sectionMax}` });
        }
        if (i > 0 && v < table[i - 1]!) {
          issues.push({ path: `${where}.scaled.${key}[${i}]`, message: `table decreases (${table[i - 1]} -> ${v})` });
        }
      }
    }

    for (const id of section.module1) pushDup(id, `${where}.module1`);
    for (const id of section.module2Lower) pushDup(id, `${where}.module2Lower`);
    for (const id of section.module2Upper) pushDup(id, `${where}.module2Upper`);

    for (const [key, spec] of [
      ["module1", section.spec.module1],
      ["module2Lower", section.spec.module2Lower],
      ["module2Upper", section.spec.module2Upper],
    ] as const) {
      const domainSum = Object.values(spec.domainCounts).reduce((a, b) => a + b, 0);
      if (domainSum !== spec.count) {
        issues.push({
          path: `${where}.spec.${key}.domainCounts`,
          message: `sums to ${domainSum}, expected count ${spec.count}`,
        });
      }
      if (spec.sprCount > spec.count) {
        issues.push({ path: `${where}.spec.${key}.sprCount`, message: `sprCount ${spec.sprCount} > count ${spec.count}` });
      }
      if (section.sectionCode === "RW" && spec.sprCount !== 0) {
        issues.push({ path: `${where}.spec.${key}.sprCount`, message: "RW must have sprCount 0 (all MCQ)" });
      }
    }

    if (section.module1.length !== section.spec.module1.count) {
      issues.push({
        path: `${where}.module1`,
        message: `id list length ${section.module1.length} !== spec.count ${section.spec.module1.count}`,
      });
    }
    if (section.module2Lower.length !== section.spec.module2Lower.count) {
      issues.push({
        path: `${where}.module2Lower`,
        message: `id list length ${section.module2Lower.length} !== spec.count ${section.spec.module2Lower.count}`,
      });
    }
    if (section.module2Upper.length !== section.spec.module2Upper.count) {
      issues.push({
        path: `${where}.module2Upper`,
        message: `id list length ${section.module2Upper.length} !== spec.count ${section.spec.module2Upper.count}`,
      });
    }
  }

  return issues;
}
