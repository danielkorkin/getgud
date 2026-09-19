// Pure position-layout helpers shared by client and server. No DB, no
// `server-only` — imported by exam-runner.tsx (client) as well as actions.

import type { ExamBlueprint, ExamSectionCode, Variant } from "@/exams/spec";

export interface ModulePosition {
  sectionCode: ExamSectionCode;
  moduleIndex: 1 | 2;
  startPosition: number;
  itemCount: number;
  minutes: number;
}

/**
 * Fixed position layout for all four modules of an exam, computed purely
 * from the blueprint's module lengths — valid before routing happens,
 * because `module2Lower.length === module2Upper.length` is a validated
 * invariant (see validateBlueprint). This is what lets module-2
 * PracticeSetItem rows be inserted later, after routing, at a
 * position range that was already reserved.
 *
 * `sectionOrder` is the student's chosen runtime order (slots 1-2 go to
 * `sectionOrder[0]`, slots 3-4 to `sectionOrder[1]`) — independent of the
 * blueprint's own authored tuple order, which is fixed at design time.
 */
export function modulePositions(
  bp: ExamBlueprint,
  sectionOrder: readonly [ExamSectionCode, ExamSectionCode],
): ModulePosition[] {
  const bySection = new Map(bp.sections.map((s) => [s.sectionCode, s] as const));
  let cursor = 0;
  const positions: ModulePosition[] = [];
  for (const code of sectionOrder) {
    const section = bySection.get(code)!;
    positions.push({
      sectionCode: section.sectionCode,
      moduleIndex: 1,
      startPosition: cursor,
      itemCount: section.module1.length,
      minutes: section.minutesPerModule,
    });
    cursor += section.module1.length;
    // module2Lower/Upper are guaranteed equal length by validateBlueprint.
    positions.push({
      sectionCode: section.sectionCode,
      moduleIndex: 2,
      startPosition: cursor,
      itemCount: section.module2Lower.length,
      minutes: section.minutesPerModule,
    });
    cursor += section.module2Lower.length;
  }
  return positions;
}

export function totalQuestionCount(bp: ExamBlueprint, sectionOrder: readonly [ExamSectionCode, ExamSectionCode]): number {
  return modulePositions(bp, sectionOrder).reduce((sum, m) => sum + m.itemCount, 0);
}

export function moduleForPosition(
  bp: ExamBlueprint,
  position: number,
  sectionOrder: readonly [ExamSectionCode, ExamSectionCode],
): ModulePosition | null {
  return (
    modulePositions(bp, sectionOrder).find((m) => position >= m.startPosition && position < m.startPosition + m.itemCount) ??
    null
  );
}

/** The committed question ids for one module, given the routed variant (module 1 has no variant). */
export function idsForModule(
  bp: ExamBlueprint,
  sectionCode: ExamSectionCode,
  moduleIndex: 1 | 2,
  variant: Variant | null,
): readonly string[] {
  const section = bp.sections.find((s) => s.sectionCode === sectionCode);
  if (!section) return [];
  if (moduleIndex === 1) return section.module1;
  return variant === "upper" ? section.module2Upper : section.module2Lower;
}
