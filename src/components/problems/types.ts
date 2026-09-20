// Shared prop shapes between src/app/problems/page.tsx (which builds them)
// and the client components under this directory (which render them). No
// "server-only" here — these are plain data shapes, safe to import from
// either side.

import type { Assessment } from "@/lib/catalog";

export interface ProblemRowOption {
  id: string;
  letter: string;
  html: string;
}

export interface ProblemRowData {
  questionId: string;
  externalId: string | null;
  ibn: string | null;
  type: "mcq" | "spr";
  contentSource: string;
  hasEmbeddedMathImages: boolean;
  sectionCode: "RW" | "MATH";
  domainLabel: string;
  skillLabel: string;
  difficulty: "E" | "M" | "H";
  scoreBand: number | null;
  gradable: boolean;
  answeredCount: number;
  correctCount: number;
  stimulusHtml: string | null;
  stemHtml: string;
  rationaleHtml: string;
  options: ProblemRowOption[] | null;
  correctOptionId: string | null;
  correctAnswer: readonly string[];
  /** Set only in similar-mode (?similar=<id>) — this row's rank among the source question's neighbours (1 = closest). */
  similarityRank: number | null;
  /** True when this row shares a non-null templateClusterId/parentTemplateId with the similar-mode source — same template, different numbers. */
  sameTemplate: boolean;
  /** "View similar problems" href for this row — /problems?similar=<id>&... preserving assessment/section/active-set context. */
  similarHref: string;
}

export interface ActiveSetItem {
  questionId: string;
  sectionCode: string;
  domainLabel: string;
  skillLabel: string;
  difficulty: string;
}

/** The set /problems is currently adding questions to, if any (?set=<id>). */
export interface ActiveSet {
  id: string;
  name: string;
  assessment: Assessment;
  questionCount: number;
  items: ActiveSetItem[];
}

/** One of this profile's existing hand-picked drafts, for the "resume a draft" picker. */
export interface DraftSetOption {
  id: string;
  name: string;
  questionCount: number;
  assessment: Assessment;
}
