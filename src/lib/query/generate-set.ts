import "server-only";

import { param } from "@prisma/orm-postgres/relational-core";
import { db } from "@/prisma/db";
import { RESERVED_QUESTION_IDS } from "@/exams";
import {
  DIFFICULTIES,
  QUESTION_TYPES,
  SCORE_BANDS,
  domainsForSection,
  isValidAssessment,
  isValidDifficulty,
  isValidDomainCode,
  isValidQuestionType,
  isValidScoreBand,
  isValidSectionCode,
  isValidSkillCode,
  type Assessment,
  type Difficulty,
  type QuestionType,
  type SectionCode,
} from "@/lib/catalog";

/**
 * The full, resolved generator spec — "resolved" meaning every "all"
 * shorthand (an empty array from the builder UI) has already been expanded
 * to concrete codes. This is what gets persisted as `PracticeSet.config`,
 * so regenerating a set later is deterministic even if the catalog changes.
 */
export interface SetFilters {
  assessment: Assessment;
  sectionCodes: SectionCode[];
  difficulties: Difficulty[];
  domainCodes: string[];
  skillCodes: string[];
  scoreBands: number[];
  types: QuestionType[];
  excludeAttempted: boolean;
  questionCount: number;
}

/** Builder-facing input — empty arrays mean "all" within the selected sections/domains. */
export interface RawSetFilters {
  assessment: string;
  sectionCodes: string[];
  difficulties: string[];
  domainCodes: string[];
  skillCodes: string[];
  scoreBands: number[];
  types: string[];
  excludeAttempted: boolean;
  questionCount: number;
}

export type ValidationResult = { ok: true; filters: SetFilters } | { ok: false; error: string };

const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 100;

/** Validate builder input against the catalog and resolve "all" shorthands to concrete codes. */
export function validateSetFilters(raw: RawSetFilters): ValidationResult {
  if (!isValidAssessment(raw.assessment)) return { ok: false, error: `Unknown assessment: ${raw.assessment}` };

  const sectionCodes = raw.sectionCodes.length > 0 ? raw.sectionCodes : ["RW", "MATH"];
  for (const s of sectionCodes) {
    if (!isValidSectionCode(s)) return { ok: false, error: `Unknown section: ${s}` };
  }

  const difficulties = raw.difficulties.length > 0 ? raw.difficulties : DIFFICULTIES.map((d) => d.code);
  for (const d of difficulties) {
    if (!isValidDifficulty(d)) return { ok: false, error: `Unknown difficulty: ${d}` };
  }

  const validDomainsForSections = sectionCodes.flatMap((s) => domainsForSection(s as SectionCode));
  const domainCodes =
    raw.domainCodes.length > 0 ? raw.domainCodes : validDomainsForSections.map((d) => d.code);
  const validDomainCodeSet = new Set(validDomainsForSections.map((d) => d.code));
  for (const d of domainCodes) {
    if (!isValidDomainCode(d) || !validDomainCodeSet.has(d)) {
      return { ok: false, error: `Domain ${d} is not in the selected section(s)` };
    }
  }

  const validSkillsForDomains = validDomainsForSections
    .filter((d) => domainCodes.includes(d.code))
    .flatMap((d) => d.skills);
  const skillCodes = raw.skillCodes.length > 0 ? raw.skillCodes : validSkillsForDomains.map((s) => s.code);
  const validSkillCodeSet = new Set(validSkillsForDomains.map((s) => s.code));
  for (const s of skillCodes) {
    if (!isValidSkillCode(s) || !validSkillCodeSet.has(s)) {
      return { ok: false, error: `Skill ${s} is not in the selected domain(s)` };
    }
  }

  const scoreBands = raw.scoreBands.length > 0 ? raw.scoreBands : [...SCORE_BANDS];
  for (const b of scoreBands) {
    if (!isValidScoreBand(b)) return { ok: false, error: `Unknown score band: ${b}` };
  }

  const types = raw.types.length > 0 ? raw.types : QUESTION_TYPES.map((t) => t.code);
  for (const t of types) {
    if (!isValidQuestionType(t)) return { ok: false, error: `Unknown question type: ${t}` };
  }

  if (!Number.isInteger(raw.questionCount) || raw.questionCount < MIN_QUESTIONS || raw.questionCount > MAX_QUESTIONS) {
    return { ok: false, error: `Question count must be between ${MIN_QUESTIONS} and ${MAX_QUESTIONS}` };
  }

  return {
    ok: true,
    filters: {
      assessment: raw.assessment as Assessment,
      sectionCodes: sectionCodes as SectionCode[],
      difficulties: difficulties as Difficulty[],
      domainCodes,
      skillCodes,
      scoreBands,
      types: types as QuestionType[],
      excludeAttempted: raw.excludeAttempted,
      questionCount: raw.questionCount,
    },
  };
}

export interface SampledQuestion {
  questionId: string;
  type: string;
  contentSource: string;
  sectionCode: string;
  domainCode: string;
  skillCode: string;
  difficulty: string;
  scoreBand: number | null;
}

// question_assessment's primary key is (assessment, questionId) — fixing a
// single `assessment` in every filter set means this JOIN is 1:1, so a
// sampled id can never come back twice from a different placement.
function buildWhereFragment(filters: SetFilters, profileId: string | null) {
  const excludeAttempted = filters.excludeAttempted && profileId !== null;
  return {
    assessment: filters.assessment,
    sections: param(filters.sectionCodes, { codecId: "pg/text@1" }),
    difficulties: param(filters.difficulties, { codecId: "pg/text@1" }),
    domains: param(filters.domainCodes, { codecId: "pg/text@1" }),
    skills: param(filters.skillCodes, { codecId: "pg/text@1" }),
    scoreBands: param(filters.scoreBands, { codecId: "pg/int4@1" }),
    types: param(filters.types, { codecId: "pg/text@1" }),
    excludeAttempted,
    profileId: profileId ?? "",
    // Questions used by a premade exam (src/exams/*) are reserved out of
    // random practice-set sampling entirely, so a first full-length test
    // isn't spoiled by having drilled its exact questions beforehand.
    // `= ANY('{}')` is false for every row, so an empty registry is a no-op.
    reserved: param(RESERVED_QUESTION_IDS as string[], { codecId: "pg/text@1" }),
  };
}

export async function countMatchingQuestions(filters: SetFilters, profileId: string | null): Promise<number> {
  const w = buildWhereFragment(filters, profileId);
  const plan = db.raw.sql`
    SELECT count(*)::int AS n
    FROM question q
    JOIN question_assessment qa ON qa."questionId" = q.id
    WHERE qa.assessment = ${w.assessment}
      AND qa."sectionCode" = ANY(${w.sections})
      AND qa.difficulty = ANY(${w.difficulties})
      AND qa."domainCode" = ANY(${w.domains})
      AND qa."skillCode" = ANY(${w.skills})
      AND (qa."scoreBand" IS NULL OR qa."scoreBand" = ANY(${w.scoreBands}))
      AND q.type = ANY(${w.types})
      AND cardinality(q."correctAnswer") > 0
      AND NOT (q.id = ANY(${w.reserved}))
      AND (
        NOT ${w.excludeAttempted}
        OR NOT EXISTS (SELECT 1 FROM attempt a WHERE a."profileId" = ${w.profileId} AND a."questionId" = q.id)
      )
  `
    .returnsRow({ n: "pg/int4@1" })
    .build();
  const [row] = await db.runtime().query(plan);
  return row?.n ?? 0;
}

export async function sampleQuestions(
  filters: SetFilters,
  profileId: string | null,
): Promise<SampledQuestion[]> {
  const w = buildWhereFragment(filters, profileId);
  const plan = db.raw.sql`
    SELECT
      q.id AS "questionId",
      q.type,
      q."contentSource",
      qa."sectionCode",
      qa."domainCode",
      qa."skillCode",
      qa.difficulty,
      qa."scoreBand"
    FROM question q
    JOIN question_assessment qa ON qa."questionId" = q.id
    WHERE qa.assessment = ${w.assessment}
      AND qa."sectionCode" = ANY(${w.sections})
      AND qa.difficulty = ANY(${w.difficulties})
      AND qa."domainCode" = ANY(${w.domains})
      AND qa."skillCode" = ANY(${w.skills})
      AND (qa."scoreBand" IS NULL OR qa."scoreBand" = ANY(${w.scoreBands}))
      AND q.type = ANY(${w.types})
      AND cardinality(q."correctAnswer") > 0
      AND NOT (q.id = ANY(${w.reserved}))
      AND (
        NOT ${w.excludeAttempted}
        OR NOT EXISTS (SELECT 1 FROM attempt a WHERE a."profileId" = ${w.profileId} AND a."questionId" = q.id)
      )
    ORDER BY random()
    LIMIT ${filters.questionCount}
  `
    .returnsRow({
      questionId: "pg/text@1",
      type: "pg/text@1",
      contentSource: "pg/text@1",
      sectionCode: "pg/text@1",
      domainCode: "pg/text@1",
      skillCode: "pg/text@1",
      difficulty: "pg/text@1",
      scoreBand: "pg/int4@1",
    })
    .build();
  return db.runtime().query(plan);
}
