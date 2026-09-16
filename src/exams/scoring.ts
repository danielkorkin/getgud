// Raw-to-scaled scoring for a premade exam. Pure — no DB.
//
// College Board's real digital-SAT scoring is IRT pattern scoring (an MLE
// ability estimate run through a theta -> scale-score conversion built by
// equipercentile linking to the legacy paper SAT); there is no published
// raw-score -> scale-score table for the adaptive test, and one can't be
// built without calibrated item parameters we don't have. What CB *does*
// publish is a raw -> scale conversion table for the LINEAR/paper practice
// tests (confirmed identical in shape across officially released forms) —
// see "Scoring Your Paper SAT Practice Test #4/#6". We use that table,
// rescaled to our module lengths, as an honest, documented approximation.
//
// Likewise, `SectionBlueprint.routingThreshold` (a raw Module-1 correct
// count) stands in for CB's real routing statistic (an EAP theta estimate
// on Module 1 against a cut chosen so ~50% of the population routes each
// way). We approximate that split with a raw-count threshold near the
// commonly-estimated ~64-67% mark. None of this claims psychometric
// equivalence with the real digital SAT — it's a faithful *structural*
// simulation (module layout, ordering, adaptivity direction, scale range),
// not a claim to reproduce College Board's actual scoring model.
//
// The one number anchored to an official statement: College Board's
// Technical Manual gives a worked example where a top student who
// deliberately underperforms on Module 1 to get routed to the easier
// Module 2, then answers every item on it correctly, "would, at most, earn
// a 580" on Math. `sat-practice-1.ts`'s `scaled.lower` table for MATH is
// authored so its maximum value matches that figure.

import type { ExamBlueprint, SectionBlueprint, Variant } from "./spec";

/** Look up the scaled 200-800 score for one section, given which Module 2 variant was served. */
export function scaleSection(section: SectionBlueprint, variant: Variant, rawTotal: number): number {
  const table = variant === "upper" ? section.scaled.upper : section.scaled.lower;
  const index = Math.min(Math.max(rawTotal, 0), table.length - 1);
  return table[index]!;
}

export interface ExamScoreInput {
  rwVariant: Variant;
  rwRaw: number;
  mathVariant: Variant;
  mathRaw: number;
}

export interface ExamScoreResult {
  rwScaled: number;
  mathScaled: number;
  totalScaled: number;
}

export function scoreExam(bp: ExamBlueprint, input: ExamScoreInput): ExamScoreResult {
  const [rw, math] = bp.sections;
  const rwScaled = scaleSection(rw, input.rwVariant, input.rwRaw);
  const mathScaled = scaleSection(math, input.mathVariant, input.mathRaw);
  return { rwScaled, mathScaled, totalScaled: rwScaled + mathScaled };
}

/** Which Module 2 variant a section routes to, given the raw Module-1 score. */
export function routeVariant(section: SectionBlueprint, module1RawCorrect: number): Variant {
  return module1RawCorrect >= section.routingThreshold ? "upper" : "lower";
}
