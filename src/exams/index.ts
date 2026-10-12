// Registry of premade exams. Deliberately dependency-free (no
// `server-only`, no `@/prisma/db`) — see spec.ts's header comment.
//
// Why a blueprint naming College Board question ids is "the same test" on
// every self-hosted instance: `question.id` IS the College Board natural
// key (external_id for qbank items, ibn for disclosed items — verified
// against the live DB: id === externalId for every qbank row, id === ibn
// for every disclosed row). Any two instances that scraped the same
// College Board bank end up with identical ids for identical questions, so
// a blueprint that names ids (rather than a filter spec that gets
// re-sampled) produces the exact same test everywhere it can run at all.
// `checkExamAvailability` (src/lib/exam/availability.ts) is what verifies
// "can run at all" against a given instance's actual loaded data.

import { validateBlueprint, type ExamBlueprint } from "./spec";
import { SAT_PRACTICE_1 } from "./sat-practice-1";
import { SAT_PRACTICE_2 } from "./sat-practice-2";
import { SAT_SMOKE } from "./sat-smoke";
import { PSAT_PRACTICE_1 } from "./psat-practice-1";
import { PSAT_SMOKE } from "./psat-smoke";

const ALL_BLUEPRINTS: readonly ExamBlueprint[] = [SAT_PRACTICE_1, SAT_PRACTICE_2, SAT_SMOKE, PSAT_PRACTICE_1, PSAT_SMOKE];

function assertRegistryInvariants(blueprints: readonly ExamBlueprint[]): void {
  for (const bp of blueprints) {
    const issues = validateBlueprint(bp);
    if (issues.length > 0) {
      throw new Error(`Exam blueprint "${bp.id}" failed validation: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
    }
  }

  const idOwner = new Map<string, string>();
  for (const bp of blueprints) {
    const ids = bp.sections.flatMap((s) => [...s.module1, ...s.module2Lower, ...s.module2Upper]);
    for (const id of ids) {
      const owner = idOwner.get(id);
      if (owner && owner !== bp.id) {
        throw new Error(`Question id ${id} is claimed by both exam "${owner}" and exam "${bp.id}" — every blueprint must use disjoint ids.`);
      }
      idOwner.set(id, bp.id);
    }
  }

  const seenExamIds = new Set<string>();
  for (const bp of blueprints) {
    if (seenExamIds.has(bp.id)) throw new Error(`Duplicate exam id in registry: ${bp.id}`);
    seenExamIds.add(bp.id);
  }
}

assertRegistryInvariants(ALL_BLUEPRINTS);

/** Every registered exam, including dev-only ones — callers that render `/tests` should filter with `isExamVisible`. */
export const EXAMS: readonly ExamBlueprint[] = ALL_BLUEPRINTS;

export function isExamVisible(bp: ExamBlueprint): boolean {
  return !bp.devOnly || process.env.NODE_ENV !== "production";
}

export function getExam(id: string): ExamBlueprint | null {
  return ALL_BLUEPRINTS.find((bp) => bp.id === id) ?? null;
}

/** Union of every question id used by any registered exam — for reserving them out of `/new`'s random sampling. */
export const RESERVED_QUESTION_IDS: readonly string[] = [
  ...new Set(ALL_BLUEPRINTS.flatMap((bp) => bp.sections.flatMap((s) => [...s.module1, ...s.module2Lower, ...s.module2Upper]))),
];

export type { ExamBlueprint, ExamAssessment, SectionBlueprint, ModuleSpec, Variant, ExamSectionCode } from "./spec";
