// The /problems browser's two queries — a count and a paginated page of
// facet rows, joined against the question this profile has (or hasn't)
// attempted. Sibling of generate-set.ts, deliberately NOT sharing its
// `buildWhereFragment`: this WHERE clause differs from it in ways that must
// never leak back into /new's random sampling (see the two "Deliberately
// NOT inherited" notes below), so it gets its own copy rather than a shared
// helper that could accidentally reintroduce them there.
//
// `param` must come from `@/prisma/db`, not `@prisma/orm-postgres/relational-core`
// directly — see the comment in db.ts for why importing it straight from the
// package can hand `db.raw.sql` a `ParamRef` from a different Turbopack bundle.
import "server-only";
import { db, param } from "@/prisma/db";
import { BROWSE_PAGE_SIZE, type BrowseFilters } from "./browse-filters";

export interface BrowseRow {
  questionId: string;
  externalId: string | null;
  ibn: string | null;
  type: string;
  contentSource: string;
  contentHash: string;
  stem: string;
  stimulus: string | null;
  rationale: string | null;
  answerOptions: unknown;
  correctKeys: readonly string[];
  correctAnswer: readonly string[];
  hasEmbeddedMathImages: boolean;
  sectionCode: string;
  domainCode: string;
  skillCode: string;
  difficulty: string;
  scoreBand: number | null;
  /** Same definition src/lib/grading.ts's `gradeAnswer` uses: correctKeys.length > 0. */
  gradable: boolean;
  /** This profile's answered-attempt count for this question. */
  answeredCount: number;
  /** This profile's correct-attempt count for this question. */
  correctCount: number;
  /** College Board's own template-grouping keys — used to flag "same template" neighbours in similar-mode. */
  templateClusterId: string | null;
  parentTemplateId: string | null;
  /** Cosine similarity to filters.similarTo, joined in JS from rankSimilar() — null outside similar-mode. */
  similarity: number | null;
}

/** Escape `\`, `%`, `_` so a raw search string used in an ILIKE pattern matches literally, not as SQL LIKE wildcards. */
function escapeLikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * "View similar problems" ranking, computed up front by the caller
 * (rankSimilar() in similar-questions.ts) and passed in here — this file
 * only needs the resulting ordered id list to filter/sort by; it never talks
 * to the embedding index directly. `ids` is best-first; `scores` keyed by
 * questionId for the JS join in browseQuestions.
 */
export interface SimilarContext {
  ids: string[];
  scores: Map<string, number>;
}

function buildBrowseWhereFragment(filters: BrowseFilters, profileId: string, similar: SimilarContext | null) {
  return {
    assessment: filters.assessment,
    sections: param(filters.sectionCodes, { codecId: "pg/text@1" }),
    difficulties: param(filters.difficulties, { codecId: "pg/text@1" }),
    domains: param(filters.domainCodes, { codecId: "pg/text@1" }),
    skills: param(filters.skillCodes, { codecId: "pg/text@1" }),
    scoreBands: param(filters.scoreBands, { codecId: "pg/int4@1" }),
    types: param(filters.types, { codecId: "pg/text@1" }),
    search: filters.search,
    pattern: `%${escapeLikePattern(filters.search)}%`,
    attempted: filters.attempted,
    profileId,
    similarOn: filters.similarTo !== "",
    similarIds: param(similar?.ids ?? [], { codecId: "pg/text@1" }),
  };
}

// question_assessment's primary key is (assessment, questionId) — fixing a
// single `assessment` keeps this JOIN 1:1, exactly as generate-set.ts's
// comment explains, so a question can never appear twice under two
// different difficulties.
// Deliberately NOT inherited from generate-set.ts's buildWhereFragment: no
// "cardinality(correctAnswer) > 0" filter and no "NOT (q.id = ANY(reserved))"
// exclusion below — the browser shows ungradable and exam-reserved
// questions too (flagged in the UI), by explicit product decision. /new
// keeps both filters unchanged; do not add them here just to match it.
export async function countBrowseQuestions(
  filters: BrowseFilters,
  profileId: string,
  similar: SimilarContext | null = null,
): Promise<number> {
  const w = buildBrowseWhereFragment(filters, profileId, similar);
  const plan = db.raw.sql`
    SELECT count(*)::int AS n
    FROM question q
    JOIN question_assessment qa ON qa."questionId" = q.id
    WHERE qa.assessment = ${w.assessment}::text
      AND qa."sectionCode" = ANY(${w.sections})
      AND qa.difficulty = ANY(${w.difficulties})
      AND qa."domainCode" = ANY(${w.domains})
      AND qa."skillCode" = ANY(${w.skills})
      AND (qa."scoreBand" IS NULL OR qa."scoreBand" = ANY(${w.scoreBands}))
      AND q.type = ANY(${w.types})
      AND (${w.search}::text = '' OR q.stem ILIKE ${w.pattern}::text OR q.stimulus ILIKE ${w.pattern}::text)
      AND (
        ${w.attempted}::text = 'any'
        OR (${w.attempted}::text = 'unattempted' AND NOT EXISTS (SELECT 1 FROM attempt a WHERE a."profileId" = ${w.profileId}::text AND a."questionId" = q.id AND a.status = 'answered'))
        OR (${w.attempted}::text = 'attempted' AND EXISTS (SELECT 1 FROM attempt a WHERE a."profileId" = ${w.profileId}::text AND a."questionId" = q.id AND a.status = 'answered'))
        OR (${w.attempted}::text = 'incorrect' AND EXISTS (SELECT 1 FROM attempt a WHERE a."profileId" = ${w.profileId}::text AND a."questionId" = q.id AND a."isCorrect" = false))
      )
      AND (NOT ${w.similarOn} OR q.id = ANY(${w.similarIds}))
  `
    .returnsRow({ n: "pg/int4@1" })
    .build();
  const [row] = await db.runtime().query(plan);
  return row?.n ?? 0;
}

interface BrowseFacetRow {
  questionId: string;
  sectionCode: string;
  domainCode: string;
  skillCode: string;
  difficulty: string;
  scoreBand: number | null;
  answeredCount: number;
  correctCount: number;
}

/**
 * Facets + per-profile attempt counts only — text/int4 columns exclusively,
 * matching the codecs generate-set.ts and exams.ts's fetchFacets already
 * use. Content fields (stem/stimulus/rationale/answerOptions/correctKeys/
 * correctAnswer, a mix of Jsonb and String[]) are deliberately NOT fetched
 * here — they're read back through the ORM in `browseQuestions` below,
 * which already knows how to decode those types natively and needs no new
 * codec plumbing for them.
 *
 * Because `${}` in db.raw.sql is always a bind parameter, never an
 * identifier, the sort is a param-driven CASE rather than an interpolated
 * `ORDER BY <column>`. The `qa.section::text` prefix on the default
 * "skill" sort matters: `domainCode` alone sorts alphabetically (CAS, EOI,
 * H, INI, P, Q, S...), which interleaves Reading/Writing and Math domains;
 * prefixing by section groups RW first. `q.id` is the tiebreaker that keeps
 * paging stable across pages.
 */
async function fetchBrowseFacetRows(
  filters: BrowseFilters,
  profileId: string,
  similar: SimilarContext | null,
): Promise<BrowseFacetRow[]> {
  const w = buildBrowseWhereFragment(filters, profileId, similar);

  const sortKey =
    filters.sort === "difficulty_asc" || filters.sort === "difficulty_desc"
      ? "difficulty"
      : filters.sort === "band_asc" || filters.sort === "band_desc"
        ? "band"
        : filters.sort === "similarity"
          ? "similarity"
          : "skill";
  const sortSign = filters.sort === "difficulty_desc" || filters.sort === "band_desc" ? -1 : 1;
  const limit = BROWSE_PAGE_SIZE;
  const offset = (filters.page - 1) * BROWSE_PAGE_SIZE;

  const plan = db.raw.sql`
    SELECT
      q.id AS "questionId",
      qa."sectionCode",
      qa."domainCode",
      qa."skillCode",
      qa.difficulty,
      qa."scoreBand",
      (SELECT count(*)::int FROM attempt a WHERE a."profileId" = ${w.profileId}::text AND a."questionId" = q.id AND a.status = 'answered') AS "answeredCount",
      (SELECT count(*)::int FROM attempt a WHERE a."profileId" = ${w.profileId}::text AND a."questionId" = q.id AND a."isCorrect" = true) AS "correctCount"
    FROM question q
    JOIN question_assessment qa ON qa."questionId" = q.id
    WHERE qa.assessment = ${w.assessment}::text
      AND qa."sectionCode" = ANY(${w.sections})
      AND qa.difficulty = ANY(${w.difficulties})
      AND qa."domainCode" = ANY(${w.domains})
      AND qa."skillCode" = ANY(${w.skills})
      AND (qa."scoreBand" IS NULL OR qa."scoreBand" = ANY(${w.scoreBands}))
      AND q.type = ANY(${w.types})
      AND (${w.search}::text = '' OR q.stem ILIKE ${w.pattern}::text OR q.stimulus ILIKE ${w.pattern}::text)
      AND (
        ${w.attempted}::text = 'any'
        OR (${w.attempted}::text = 'unattempted' AND NOT EXISTS (SELECT 1 FROM attempt a WHERE a."profileId" = ${w.profileId}::text AND a."questionId" = q.id AND a.status = 'answered'))
        OR (${w.attempted}::text = 'attempted' AND EXISTS (SELECT 1 FROM attempt a WHERE a."profileId" = ${w.profileId}::text AND a."questionId" = q.id AND a.status = 'answered'))
        OR (${w.attempted}::text = 'incorrect' AND EXISTS (SELECT 1 FROM attempt a WHERE a."profileId" = ${w.profileId}::text AND a."questionId" = q.id AND a."isCorrect" = false))
      )
      AND (NOT ${w.similarOn} OR q.id = ANY(${w.similarIds}))
    ORDER BY
      (CASE ${sortKey}::text
         WHEN 'difficulty' THEN CASE qa.difficulty WHEN 'E' THEN 1 WHEN 'M' THEN 2 ELSE 3 END
         WHEN 'band' THEN coalesce(qa."scoreBand", 0)
         WHEN 'similarity' THEN coalesce(array_position(${w.similarIds}::text[], q.id), 999999)
         ELSE 0 END) * ${sortSign}::int4,
      CASE WHEN ${sortKey}::text = 'skill'
           THEN qa.section::text || '|' || qa."domainCode" || '|' || qa."skillCode" END NULLS LAST,
      q.id
    LIMIT ${limit}::int4 OFFSET ${offset}::int4
  `
    .returnsRow({
      questionId: "pg/text@1",
      sectionCode: "pg/text@1",
      domainCode: "pg/text@1",
      skillCode: "pg/text@1",
      difficulty: "pg/text@1",
      scoreBand: "pg/int4@1",
      answeredCount: "pg/int4@1",
      correctCount: "pg/int4@1",
    })
    .build();
  return db.runtime().query(plan);
}

export async function browseQuestions(
  filters: BrowseFilters,
  profileId: string,
  similar: SimilarContext | null = null,
): Promise<BrowseRow[]> {
  const facetRows = await fetchBrowseFacetRows(filters, profileId, similar);
  if (facetRows.length === 0) return [];

  const questions = await db.orm.public.Question.where((q) => q.id.in(facetRows.map((r) => r.questionId))).all();
  const questionById = new Map(questions.map((q) => [q.id, q]));

  const rows: BrowseRow[] = [];
  for (const r of facetRows) {
    const q = questionById.get(r.questionId);
    if (!q) continue; // shouldn't happen — r came from a JOIN against `question` itself
    rows.push({
      questionId: q.id,
      externalId: q.externalId,
      ibn: q.ibn,
      type: q.type,
      contentSource: q.contentSource,
      contentHash: q.contentHash,
      stem: q.stem,
      stimulus: q.stimulus,
      rationale: q.rationale,
      answerOptions: q.answerOptions,
      correctKeys: q.correctKeys,
      correctAnswer: q.correctAnswer,
      hasEmbeddedMathImages: q.hasEmbeddedMathImages,
      sectionCode: r.sectionCode,
      domainCode: r.domainCode,
      skillCode: r.skillCode,
      difficulty: r.difficulty,
      scoreBand: r.scoreBand,
      gradable: q.correctKeys.length > 0,
      answeredCount: r.answeredCount,
      correctCount: r.correctCount,
      templateClusterId: q.templateClusterId,
      parentTemplateId: q.parentTemplateId,
      similarity: similar?.scores.get(q.id) ?? null,
    });
  }
  return rows;
}
