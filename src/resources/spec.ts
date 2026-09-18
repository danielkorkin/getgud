// Types + validation for the Learn half of the site: curated external
// resources and original in-app study guides.
//
// Deliberately dependency-free (no `server-only`, no `@/prisma/db`) — same
// constraint, same reason, as src/exams/spec.ts: this module is imported by
// RSC pages, by a client component (the resource directory filters on the
// client), and by src/lib. Pulling DB code in here would leak it into
// bundles that must never touch Postgres.
//
// Why this is committed code and not database rows, mirroring src/exams/:
//   - A resource shelf is the same on every self-hosted copy of Getgud, so
//     it's a fact about the app, not about one instance's data.
//   - It works on a fresh clone. The Learn half renders before `pnpm scrape`
//     has ever run, which matters because the whole Practice half is empty
//     until the pipeline completes — a new user has something to read on
//     day one.
//   - No contract change, no `prisma db update`, no migration to pull.
//   - Edits are reviewable in a diff, which is what curation actually needs.
//
// The load-bearing part is `skillCodes`/`domainCodes`: every code is
// validated against src/lib/catalog.ts at module load (see index.ts). A
// typo'd skill code would not throw at runtime — it would just silently
// never match, so a student's weakest skill would quietly show no
// resources on the results page. That's precisely the class of silent
// failure the exam registry's load-time assertions exist to prevent, so
// this follows the same approach.

import { isValidDomainCode, isValidSectionCode, isValidSkillCode, type SectionCode } from "@/lib/catalog";

/** Which exam(s) a resource or guide applies to. Narrower than catalog's ASSESSMENTS: resources are curated per test, not per scored placement. */
export type TestTarget = "SAT" | "PSAT";

export type ResourceKind =
  | "course" // structured, sequenced instruction — start here and work through it
  | "video-channel" // an ongoing channel, not a fixed curriculum
  | "playlist" // a finite, ordered video series
  | "practice" // question banks and full-length tests
  | "article" // a single written explainer or guide
  | "reference" // specs, scoring tables, official documentation
  | "tool" // calculators, timers, flashcards
  | "book" // print/ebook, essentially always paid
  | "community"; // forums where people answer questions

export type ResourceCost =
  | "free" // no payment, no account required to get real value
  | "free-account" // free, but you must make an account
  | "freemium" // a genuinely useful free tier plus paid upgrades
  | "paid";

export interface Resource {
  /** kebab-case, stable, unique across the registry — it appears in URLs and anchors. */
  id: string;
  title: string;
  /** Who publishes it, e.g. "College Board", "Khan Academy". Shown as the attribution line. */
  provider: string;
  url: string;
  kind: ResourceKind;
  cost: ResourceCost;
  /**
   * One or two sentences on what this is *good for* — specifically not a
   * description of what it is. "Official adaptive practice tests in the
   * real testing app" beats "a testing application by College Board".
   */
  summary: string;
  tests: readonly TestTarget[];
  /** Empty means "applies to the whole test", e.g. a study planner. */
  sectionCodes?: readonly SectionCode[];
  domainCodes?: readonly string[];
  skillCodes?: readonly string[];
  /** Surfaced above the fold on /learn. Keep this a short list — everything can't be featured. */
  featured?: boolean;
  /**
   * ISO date this URL was last confirmed to resolve. Every entry in this
   * registry was checked with a real HTTP request, not assumed from
   * memory — see the note at the top of official.ts. Link rot is the main
   * way a curated shelf decays, so record when the check happened.
   */
  verifiedAt: string;
}

// ─── Original in-app guides ─────────────────────────────────────────────────
// Everything above is a link out. Everything below is content written for
// this repo, so a student gets a usable answer without leaving the app.

export type GuideKind =
  | "cheatsheet" // dense reference to skim before a test
  | "strategy" // how to attack a question type
  | "plan"; // how to organize study time

/** One renderable unit of guide content. Kept small and closed — the renderer switches exhaustively over `kind`, so adding a block type is a deliberate, type-checked change, never a silent no-op. */
export type GuideBlock =
  | { kind: "text"; content: string }
  | { kind: "list"; ordered?: boolean; items: readonly string[] }
  /** Named rules with an explanation and optional worked example. The workhorse for grammar and question-type guides. */
  | { kind: "rules"; items: readonly { rule: string; detail: string; example?: string }[] }
  /** `latex` is rendered by KaTeX server-side (see renderGuideLatex in src/lib/content/render.ts); `note` says when to reach for it. */
  | { kind: "formulas"; items: readonly { name: string; latex: string; note?: string }[] }
  /** A short two-column comparison, e.g. "if you see X → do Y". */
  | { kind: "table"; columns: readonly [string, string]; rows: readonly (readonly [string, string])[] }
  | { kind: "callout"; tone: "tip" | "warning"; content: string };

export interface GuideSection {
  heading: string;
  blocks: readonly GuideBlock[];
}

export interface Guide {
  id: string;
  title: string;
  kind: GuideKind;
  /** One sentence, shown on cards and as the page subtitle. */
  summary: string;
  /** Rough reading time in minutes. Hand-authored — a student deciding what to open in ten spare minutes needs this more than an exact count. */
  minutes: number;
  tests: readonly TestTarget[];
  sectionCode?: SectionCode;
  domainCodes?: readonly string[];
  skillCodes?: readonly string[];
  featured?: boolean;
  sections: readonly GuideSection[];
  /** Resource ids to read next. Validated to exist, so a renamed resource id breaks the build instead of rendering a dead "further reading" link. */
  related?: readonly string[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateTaxonomy(
  where: string,
  entry: { sectionCodes?: readonly string[]; domainCodes?: readonly string[]; skillCodes?: readonly string[] },
  issues: ValidationIssue[],
): void {
  for (const code of entry.sectionCodes ?? []) {
    if (!isValidSectionCode(code)) issues.push({ path: `${where}.sectionCodes`, message: `unknown section code: ${code}` });
  }
  for (const code of entry.domainCodes ?? []) {
    if (!isValidDomainCode(code)) issues.push({ path: `${where}.domainCodes`, message: `unknown domain code: ${code}` });
  }
  for (const code of entry.skillCodes ?? []) {
    if (!isValidSkillCode(code)) issues.push({ path: `${where}.skillCodes`, message: `unknown skill code: ${code}` });
  }
}

export function validateResource(r: Resource): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const where = `resource[${r.id}]`;

  if (!ID_RE.test(r.id)) issues.push({ path: where, message: `id must be kebab-case: ${r.id}` });
  if (r.title.trim() === "") issues.push({ path: `${where}.title`, message: "empty title" });
  if (r.provider.trim() === "") issues.push({ path: `${where}.provider`, message: "empty provider" });
  if (r.summary.trim() === "") issues.push({ path: `${where}.summary`, message: "empty summary" });
  if (r.tests.length === 0) issues.push({ path: `${where}.tests`, message: "must target at least one test" });

  // https only. These are third-party links rendered with target="_blank";
  // an http:// link would be silently upgraded or blocked by the browser,
  // and there's no reason to ship one.
  let parsed: URL | null = null;
  try {
    parsed = new URL(r.url);
  } catch {
    issues.push({ path: `${where}.url`, message: `unparseable URL: ${r.url}` });
  }
  if (parsed && parsed.protocol !== "https:") {
    issues.push({ path: `${where}.url`, message: `must be https: ${r.url}` });
  }

  if (!ISO_DATE_RE.test(r.verifiedAt)) {
    issues.push({ path: `${where}.verifiedAt`, message: `must be YYYY-MM-DD: ${r.verifiedAt}` });
  }

  validateTaxonomy(where, r, issues);
  return issues;
}

export function validateGuide(g: Guide): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const where = `guide[${g.id}]`;

  if (!ID_RE.test(g.id)) issues.push({ path: where, message: `id must be kebab-case: ${g.id}` });
  if (g.title.trim() === "") issues.push({ path: `${where}.title`, message: "empty title" });
  if (g.summary.trim() === "") issues.push({ path: `${where}.summary`, message: "empty summary" });
  if (g.minutes <= 0) issues.push({ path: `${where}.minutes`, message: `must be positive: ${g.minutes}` });
  if (g.tests.length === 0) issues.push({ path: `${where}.tests`, message: "must target at least one test" });
  if (g.sections.length === 0) issues.push({ path: `${where}.sections`, message: "guide has no sections" });

  g.sections.forEach((section, i) => {
    if (section.heading.trim() === "") issues.push({ path: `${where}.sections[${i}]`, message: "empty heading" });
    if (section.blocks.length === 0) issues.push({ path: `${where}.sections[${i}]`, message: "section has no blocks" });
    section.blocks.forEach((block, j) => {
      const at = `${where}.sections[${i}].blocks[${j}]`;
      switch (block.kind) {
        case "text":
        case "callout":
          if (block.content.trim() === "") issues.push({ path: at, message: `empty ${block.kind}` });
          break;
        case "list":
          if (block.items.length === 0) issues.push({ path: at, message: "empty list" });
          break;
        case "rules":
          if (block.items.length === 0) issues.push({ path: at, message: "empty rules block" });
          break;
        case "formulas":
          if (block.items.length === 0) issues.push({ path: at, message: "empty formulas block" });
          break;
        case "table":
          if (block.rows.length === 0) issues.push({ path: at, message: "empty table" });
          break;
      }
    });
  });

  validateTaxonomy(where, { ...g, sectionCodes: g.sectionCode ? [g.sectionCode] : undefined }, issues);
  return issues;
}
