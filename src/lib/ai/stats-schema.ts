// Structured-output schema for the AI performance analysis. Skill codes are
// constrained to the exact catalog enum (flattened from DOMAINS) so the
// model cannot emit a code validateSetFilters would reject — this removes
// the main failure mode of free-text generation instead of validating and
// retrying after the fact.
import "server-only";

import { z } from "zod";
import { ASSESSMENTS, DOMAINS } from "@/lib/catalog";

const SKILL_CODES = DOMAINS.flatMap((d) => d.skills.map((s) => s.code)) as [string, ...string[]];
const ASSESSMENT_VALUES = ASSESSMENTS.map((a) => a.value) as [string, ...string[]];

export const RecommendedSetSchema = z.object({
  name: z.string().min(1).max(80),
  rationale: z.string().min(1).max(240),
  assessment: z.enum(ASSESSMENT_VALUES),
  skillCodes: z.array(z.enum(SKILL_CODES)).min(1).max(6),
  // No `.default()` here — some providers' strict JSON-schema mode (e.g.
  // Azure/OpenAI structured output) requires every property to appear in
  // the schema's `required` array, which a zod default silently excludes
  // it from. An empty array is a valid, always-supplied value instead.
  difficulties: z.array(z.enum(["E", "M", "H"])).max(3),
  questionCount: z.number().int().min(5).max(30),
});

export const AnalysisSchema = z.object({
  summary: z.string().min(1).max(800),
  recommendedSets: z.array(RecommendedSetSchema).min(1).max(3),
  // Required (not `.default([])`) for the same reason as `difficulties`
  // above — an empty array is a valid, always-supplied "no pattern found"
  // answer rather than an omitted optional field. Longer/more numerous than
  // the original cap — these are now expected to name precise content
  // patterns (a passage genre/era, a specific trap-answer type, a recurring
  // math structure), not just one-line conceptual notes from chat, so they
  // need more room to be concrete rather than generic.
  troubleSpots: z.array(z.string().min(1).max(280)).max(8),
});

export type RecommendedSet = z.infer<typeof RecommendedSetSchema>;
export type Analysis = z.infer<typeof AnalysisSchema>;
