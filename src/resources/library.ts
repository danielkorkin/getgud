// Tools, books, written guides, and communities — everything that isn't a
// course, a channel, or official College Board material.
//
// Paid entries are included and labelled honestly rather than omitted: the
// books here are the ones people actually recommend to each other, and
// pretending the shelf is all-free would be less useful than saying which
// things cost money. See official.ts's header for the verification rule.

import type { Resource } from "./spec";

const V = "2026-09-17";

export const LIBRARY_RESOURCES: readonly Resource[] = [
  // ─── Tools ────────────────────────────────────────────────────────────────
  {
    id: "desmos-collegeboard-graphing",
    title: "Desmos — College Board test version",
    provider: "Desmos",
    url: "https://www.desmos.com/testing/collegeboard/graphing",
    kind: "tool",
    cost: "free",
    summary:
      "The exact calculator build embedded in Bluebook. Practise in this one rather than the standard Desmos app: the test version differs, and discovering that on test day costs time you don't have.",
    tests: ["SAT", "PSAT"],
    sectionCodes: ["MATH"],
    domainCodes: ["H", "P", "Q", "S"],
    featured: true,
    verifiedAt: V,
  },
  {
    id: "desmos-testing",
    title: "Desmos testing calculators",
    provider: "Desmos",
    url: "https://www.desmos.com/testing",
    kind: "tool",
    cost: "free",
    summary: "Index of every test-mode Desmos build, including the offline test-mode app for practice without a browser.",
    tests: ["SAT", "PSAT"],
    sectionCodes: ["MATH"],
    verifiedAt: V,
  },
  {
    id: "desmos-calculator",
    title: "Desmos graphing calculator",
    provider: "Desmos",
    url: "https://www.desmos.com/calculator",
    kind: "tool",
    cost: "free",
    summary:
      "The standard public calculator — more features than the test build, so useful for exploring a concept, but don't let its extras become habits you can't use on test day.",
    tests: ["SAT", "PSAT"],
    sectionCodes: ["MATH"],
    verifiedAt: V,
  },
  {
    id: "anki",
    title: "Anki",
    provider: "Anki",
    url: "https://apps.ankiweb.net/",
    kind: "tool",
    cost: "free",
    summary:
      "Spaced-repetition flashcards. The highest-leverage use on this test is vocabulary in context and the handful of math formulas not given on the reference sheet.",
    tests: ["SAT", "PSAT"],
    skillCodes: ["WIC"],
    verifiedAt: V,
  },

  // ─── Written guides ───────────────────────────────────────────────────────
  {
    id: "prepscholar-blog",
    title: "PrepScholar SAT blog",
    provider: "PrepScholar",
    url: "https://blog.prepscholar.com/",
    kind: "article",
    cost: "free",
    summary:
      "A deep archive of long-form articles on individual question types, score targets, and timing. Uneven and marketing-adjacent in places, but the question-type breakdowns are genuinely detailed.",
    tests: ["SAT", "PSAT"],
    verifiedAt: V,
  },
  {
    id: "uworld-sat-blog",
    title: "UWorld SAT resources",
    provider: "UWorld",
    url: "https://collegeprep.uworld.com/sat/",
    kind: "article",
    cost: "freemium",
    summary: "Written guides and strategy posts alongside a paid question bank known for thorough answer explanations.",
    tests: ["SAT"],
    verifiedAt: V,
  },
  {
    id: "critical-reader-blog",
    title: "The Critical Reader blog",
    provider: "Erica Meltzer",
    url: "https://thecriticalreader.com/blog/",
    kind: "article",
    cost: "free",
    summary:
      "Erica Meltzer writing on reading and grammar, and unusually willing to say when conventional test-prep advice is wrong. The best free writing available on the Reading and Writing section.",
    tests: ["SAT", "PSAT"],
    sectionCodes: ["RW"],
    domainCodes: ["INI", "CAS", "EOI", "SEC"],
    featured: true,
    verifiedAt: V,
  },

  // ─── Books ────────────────────────────────────────────────────────────────
  {
    id: "critical-reader-books",
    title: "The Critical Reader — SAT grammar and reading books",
    provider: "Erica Meltzer",
    url: "https://thecriticalreader.com/",
    kind: "book",
    cost: "paid",
    summary:
      "The standard recommendation for Reading and Writing, and the grammar book in particular is more systematic than any free resource: it treats the section as a finite set of rules to learn rather than a knack to develop.",
    tests: ["SAT", "PSAT"],
    sectionCodes: ["RW"],
    domainCodes: ["SEC", "EOI"],
    skillCodes: ["BOU", "FSS", "TRA", "SYN"],
    verifiedAt: V,
  },
  {
    id: "college-panda",
    title: "The College Panda — SAT Math",
    provider: "Nielson Phu",
    url: "https://thecollegepanda.com/",
    kind: "book",
    cost: "paid",
    summary:
      "The counterpart recommendation for math: topic-by-topic coverage with practice sets, written for students who want the underlying method rather than a bag of tricks.",
    tests: ["SAT", "PSAT"],
    sectionCodes: ["MATH"],
    domainCodes: ["H", "P", "Q", "S"],
    verifiedAt: V,
  },

  // ─── Community ────────────────────────────────────────────────────────────
  {
    id: "reddit-sat",
    title: "r/Sat",
    provider: "Reddit",
    url: "https://www.reddit.com/r/Sat/",
    kind: "community",
    cost: "free",
    summary:
      "Active community with score reports, resource debates, and people answering specific questions fast. Treat scoring folklore and predicted curves there with suspicion — the useful part is having a real person explain a question you're stuck on.",
    tests: ["SAT", "PSAT"],
    verifiedAt: V,
  },
];
