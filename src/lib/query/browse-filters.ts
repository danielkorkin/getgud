// Pure, dependency-free filter type + URL <-> filters conversion for the
// /problems browser (src/app/problems/page.tsx). Deliberately NOT
// "server-only" — unlike generate-set.ts, both `parseBrowseParams` and
// `browseParamsToQuery` are called at runtime from the client filter panel
// (problem-filters.tsx) to build the query string it navigates to, not just
// imported for their types. Mirrors catalog.ts in that respect: safe to
// import from a "use client" module.
//
// The actual DB queries (browse-questions.ts) are a separate, server-only
// sibling file that imports `BrowseFilters` from here.

import {
  ASSESSMENTS,
  DIFFICULTIES,
  QUESTION_TYPES,
  SCORE_BANDS,
  SECTIONS,
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

export type BrowseSort = "skill" | "difficulty_asc" | "difficulty_desc" | "band_asc" | "band_desc" | "similarity";
export type AttemptedFilter = "any" | "unattempted" | "attempted" | "incorrect";

const SORTS: readonly BrowseSort[] = [
  "skill",
  "difficulty_asc",
  "difficulty_desc",
  "band_asc",
  "band_desc",
  "similarity",
];
const ATTEMPTED_FILTERS: readonly AttemptedFilter[] = ["any", "unattempted", "attempted", "incorrect"];

export interface BrowseFilters {
  assessment: Assessment;
  /** Resolved — never empty (an unrecognized/absent URL value falls back to "all sections"). */
  sectionCodes: SectionCode[];
  difficulties: Difficulty[];
  domainCodes: string[];
  skillCodes: string[];
  scoreBands: number[];
  types: QuestionType[];
  /** "" = no text filter. Capped at MAX_SEARCH_LENGTH. */
  search: string;
  attempted: AttemptedFilter;
  sort: BrowseSort;
  /** 1-based. */
  page: number;
  /** "View similar problems" source question id. "" = off (plain browse). */
  similarTo: string;
}

export const BROWSE_PAGE_SIZE = 20;
const MAX_SEARCH_LENGTH = 200;

type SearchParamValue = string | string[] | undefined;
export type BrowseSearchParams = Record<string, SearchParamValue>;

function first(v: SearchParamValue): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function csv(v: SearchParamValue): string[] {
  const raw = first(v);
  return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * Sanitize (never reject) URL params into resolved filters. Unlike
 * validateSetFilters (src/lib/query/generate-set.ts), which rejects a
 * builder-supplied domain outside the selected section, this intersects
 * incoming values against the catalog and silently drops anything
 * unrecognized — a URL is hand-editable, and a typo'd param should render
 * the default view rather than an error boundary. Resolution order matches
 * validateSetFilters: sections -> domainsForSection -> skills.
 */
export function parseBrowseParams(sp: BrowseSearchParams): BrowseFilters {
  const assessmentRaw = first(sp.assessment);
  const assessment: Assessment = isValidAssessment(assessmentRaw) ? assessmentRaw : ASSESSMENTS[0].value;

  const sectionsRaw = csv(sp.sections).filter(isValidSectionCode);
  const sectionCodes: SectionCode[] = sectionsRaw.length > 0 ? (sectionsRaw as SectionCode[]) : SECTIONS.map((s) => s.code);

  const difficultiesRaw = csv(sp.difficulties).filter(isValidDifficulty);
  const difficulties: Difficulty[] = difficultiesRaw.length > 0 ? (difficultiesRaw as Difficulty[]) : DIFFICULTIES.map((d) => d.code);

  const availableDomains = sectionCodes.flatMap((s) => domainsForSection(s));
  const validDomainCodes = new Set(availableDomains.map((d) => d.code));
  const domainsRaw = csv(sp.domains).filter((d) => isValidDomainCode(d) && validDomainCodes.has(d));
  const domainCodes = domainsRaw.length > 0 ? domainsRaw : availableDomains.map((d) => d.code);

  const availableSkills = availableDomains.filter((d) => domainCodes.includes(d.code)).flatMap((d) => d.skills);
  const validSkillCodes = new Set(availableSkills.map((s) => s.code));
  const skillsRaw = csv(sp.skills).filter((s) => isValidSkillCode(s) && validSkillCodes.has(s));
  const skillCodes = skillsRaw.length > 0 ? skillsRaw : availableSkills.map((s) => s.code);

  const bandsRaw = csv(sp.bands)
    .map((b) => Number(b))
    .filter((b) => Number.isInteger(b) && isValidScoreBand(b));
  const scoreBands = bandsRaw.length > 0 ? bandsRaw : [...SCORE_BANDS];

  const typesRaw = csv(sp.types).filter(isValidQuestionType);
  const types: QuestionType[] = typesRaw.length > 0 ? (typesRaw as QuestionType[]) : QUESTION_TYPES.map((t) => t.code);

  const search = first(sp.q).slice(0, MAX_SEARCH_LENGTH);

  const attemptedRaw = first(sp.attempted);
  const attempted: AttemptedFilter = (ATTEMPTED_FILTERS as readonly string[]).includes(attemptedRaw)
    ? (attemptedRaw as AttemptedFilter)
    : "any";

  const similarTo = first(sp.similar);

  let sortRaw = first(sp.sort);
  // Default to similarity ranking when landing in similar-mode with no
  // explicit sort — but never let sort="similarity" survive without a source
  // id, or array_position(...) against an empty array returns NULL for every
  // row and the sort silently degrades to the q.id tiebreaker.
  if (!sortRaw && similarTo) sortRaw = "similarity";
  if (sortRaw === "similarity" && !similarTo) sortRaw = "skill";
  const sort: BrowseSort = (SORTS as readonly string[]).includes(sortRaw) ? (sortRaw as BrowseSort) : "skill";

  const pageRaw = Number(first(sp.page));
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  return {
    assessment,
    sectionCodes,
    difficulties,
    domainCodes,
    skillCodes,
    scoreBands,
    types,
    search,
    attempted,
    sort,
    page,
    similarTo,
  };
}

/**
 * Serialize filters back to a query string — used by the filter panel
 * (which merges in one changed field via `overrides`) and the pagination
 * links (which override only `page`).
 */
export function browseParamsToQuery(f: BrowseFilters, overrides?: Partial<BrowseFilters>): string {
  const merged: BrowseFilters = { ...f, ...overrides };
  const sp = new URLSearchParams();
  sp.set("assessment", merged.assessment);
  sp.set("sections", merged.sectionCodes.join(","));
  sp.set("difficulties", merged.difficulties.join(","));
  sp.set("domains", merged.domainCodes.join(","));
  sp.set("skills", merged.skillCodes.join(","));
  sp.set("bands", merged.scoreBands.join(","));
  sp.set("types", merged.types.join(","));
  if (merged.search) sp.set("q", merged.search);
  if (merged.attempted !== "any") sp.set("attempted", merged.attempted);
  // Similarity is the implicit default sort while similarTo is set (see
  // parseBrowseParams), so it's only worth naming in the URL when it
  // *disagrees* with that default — i.e. the visitor picked a different sort
  // while browsing similar results.
  const defaultSort = merged.similarTo ? "similarity" : "skill";
  if (merged.sort !== defaultSort) sp.set("sort", merged.sort);
  if (merged.page > 1) sp.set("page", String(merged.page));
  if (merged.similarTo) sp.set("similar", merged.similarTo);
  return sp.toString();
}
