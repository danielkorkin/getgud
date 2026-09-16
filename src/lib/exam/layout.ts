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
 */
export function modulePositions(bp: ExamBlueprint): ModulePosition[] {
  const [rw, math] = bp.sections;
  let cursor = 0;
  const positions: ModulePosition[] = [];
  for (const section of [rw, math]) {
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

export function totalQuestionCount(bp: ExamBlueprint): number {
  return modulePositions(bp).reduce((sum, m) => sum + m.itemCount, 0);
}

export function moduleForPosition(bp: ExamBlueprint, position: number): ModulePosition | null {
  return (
    modulePositions(bp).find((m) => position >= m.startPosition && position < m.startPosition + m.itemCount) ?? null
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
