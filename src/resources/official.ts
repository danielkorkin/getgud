// College Board's own material — the primary shelf, and the only source
// whose questions are written by the people who write the test.
//
// Every URL in this file (and in every sibling data file) was confirmed
// with a real HTTP request on the date in `verifiedAt`, not recalled. Four
// plausible-looking College Board paths were tried and turned out to be
// 404s during curation, which is the argument for checking rather than
// trusting a remembered URL shape. When adding an entry, fetch the URL
// first and set `verifiedAt` to the day you did.
//
// See ATTRIBUTION.md: this app's question bank comes from College Board,
// and these links point students back at the source rather than
// substituting for it.

import type { Resource } from "./spec";

const V = "2026-09-17";

export const OFFICIAL_RESOURCES: readonly Resource[] = [
  {
    id: "cb-bluebook-app",
    title: "Bluebook — the real testing app",
    provider: "College Board",
    url: "https://bluebook.collegeboard.org/students",
    kind: "practice",
    cost: "free-account",
    summary:
      "The actual application you sit the exam in, with free full-length adaptive practice tests. Practising anywhere else means test day is the first time you use the interface — do at least one full test here.",
    tests: ["SAT", "PSAT"],
    featured: true,
    verifiedAt: V,
  },
  {
    id: "cb-practice-tests-bluebook",
    title: "Full-length digital practice tests",
    provider: "College Board",
    url: "https://satsuite.collegeboard.org/practice/practice-tests/bluebook",
    kind: "practice",
    cost: "free",
    summary:
      "How to find and take the official adaptive practice tests inside Bluebook, including what the timing and pausing rules are. Start here if you don't know how many official tests exist.",
    tests: ["SAT", "PSAT"],
    featured: true,
    verifiedAt: V,
  },
  {
    id: "cb-question-bank",
    title: "SAT Suite Question Bank",
    provider: "College Board",
    url: "https://satsuitequestionbank.collegeboard.org/",
    kind: "practice",
    cost: "free",
    summary:
      "Thousands of official questions, filterable by domain, skill, and difficulty, each with College Board's own rationale. This is the same bank Getgud's practice sets are built from, so use it when you want to browse questions directly rather than drill a set.",
    tests: ["SAT", "PSAT"],
    featured: true,
    verifiedAt: V,
  },
  {
    id: "cb-student-question-bank",
    title: "Student Question Bank guide",
    provider: "College Board",
    url: "https://satsuite.collegeboard.org/practice/student-question-bank",
    kind: "reference",
    cost: "free",
    summary: "The student-facing explanation of how to use the question bank and what its filters mean.",
    tests: ["SAT", "PSAT"],
    verifiedAt: V,
  },
  {
    id: "cb-paper-practice-tests",
    title: "Paper practice tests (linear)",
    provider: "College Board",
    url: "https://satsuite.collegeboard.org/practice/practice-tests/paper",
    kind: "practice",
    cost: "free",
    summary:
      "Downloadable non-adaptive PDFs of full tests with answer keys and scoring tables. Useful for working away from a screen, and the source of the raw-to-scaled tables this app's own scoring approximates — but note these are linear, so they don't reproduce the adaptive module routing.",
    tests: ["SAT", "PSAT"],
    verifiedAt: V,
  },
  {
    id: "cb-whats-on-the-test",
    title: "What's on the SAT",
    provider: "College Board",
    url: "https://satsuite.collegeboard.org/sat/whats-on-the-test",
    kind: "reference",
    cost: "free",
    summary:
      "The authoritative breakdown of sections, timing, question counts, and the domains each section tests. Read this before any strategy article — everything else is commentary on it.",
    tests: ["SAT"],
    featured: true,
    verifiedAt: V,
  },
  {
    id: "cb-practice-hub",
    title: "Practice and preparation hub",
    provider: "College Board",
    url: "https://satsuite.collegeboard.org/practice",
    kind: "reference",
    cost: "free",
    summary: "The index page for every official practice route, if you'd rather navigate College Board's own structure.",
    tests: ["SAT", "PSAT"],
    verifiedAt: V,
  },
  {
    id: "cb-build-study-plan",
    title: "Build your study plan",
    provider: "College Board",
    url: "https://satsuite.collegeboard.org/practice/build-your-study-plan",
    kind: "article",
    cost: "free",
    summary: "College Board's own framework for turning a test date and a score goal into a weekly schedule.",
    tests: ["SAT", "PSAT"],
    verifiedAt: V,
  },
  {
    id: "cb-my-practice",
    title: "My Practice — your official score reports",
    provider: "College Board",
    url: "https://mypractice.collegeboard.org",
    kind: "tool",
    cost: "free-account",
    summary:
      "Where practice-test results land after Bluebook, broken down by question and skill. The official counterpart to this app's results screen.",
    tests: ["SAT", "PSAT"],
    verifiedAt: V,
  },
  {
    id: "cb-my-practice-101",
    title: "My Practice 101",
    provider: "College Board",
    url: "https://satsuite.collegeboard.org/practice/my-practice-101",
    kind: "article",
    cost: "free",
    summary: "How to actually read an official score report — which of its numbers are diagnostic and which are noise.",
    tests: ["SAT", "PSAT"],
    verifiedAt: V,
  },
  {
    id: "cb-question-of-the-day",
    title: "Question of the Day",
    provider: "College Board",
    url: "https://qotd.collegeboard.org/",
    kind: "practice",
    cost: "free",
    summary: "One official question a day. Low effort, and the most reliable way to keep contact with the test between study sessions.",
    tests: ["SAT", "PSAT"],
    verifiedAt: V,
  },
  {
    id: "cb-bluebook-how-to",
    title: "How to use Bluebook practice tests",
    provider: "College Board",
    url: "https://satsuite.collegeboard.org/practice/bluebook",
    kind: "article",
    cost: "free",
    summary: "Walkthrough of Bluebook's tools — annotation, the answer eliminator, flagging, the built-in Desmos calculator, and the reference sheet.",
    tests: ["SAT", "PSAT"],
    verifiedAt: V,
  },
  {
    id: "cb-practice-quick-start",
    title: "Practice quick-start guide (PDF)",
    provider: "College Board",
    url: "https://satsuite.collegeboard.org/media/pdf/sat-suite-practice-quick-start-guide.pdf",
    kind: "reference",
    cost: "free",
    summary: "A two-page printable summary of every official practice option. Good to hand to someone who has no idea where to begin.",
    tests: ["SAT", "PSAT"],
    verifiedAt: V,
  },
  {
    id: "cb-understanding-scores",
    title: "Understanding SAT scores",
    provider: "College Board",
    url: "https://satsuite.collegeboard.org/sat/scores/understanding-scores",
    kind: "reference",
    cost: "free",
    summary:
      "What the 200–800 section scales mean, how they combine, and what percentiles say. Relevant context for this app's own scaled scores, which are a documented approximation rather than College Board's real IRT model.",
    tests: ["SAT"],
    verifiedAt: V,
  },
  {
    id: "cb-psat-nmsqt",
    title: "PSAT/NMSQT overview",
    provider: "College Board",
    url: "https://satsuite.collegeboard.org/psat-nmsqt",
    kind: "reference",
    cost: "free",
    summary:
      "What the PSAT/NMSQT is, how it differs from the SAT, and why the junior-year administration is the one that matters for National Merit.",
    tests: ["PSAT"],
    featured: true,
    verifiedAt: V,
  },
  {
    id: "cb-psat-scores",
    title: "PSAT/NMSQT scores and the Selection Index",
    provider: "College Board",
    url: "https://satsuite.collegeboard.org/psat-nmsqt/scores",
    kind: "reference",
    cost: "free",
    summary:
      "How PSAT scoring works, including the Selection Index that National Merit cutoffs are drawn against — which weights Reading and Writing twice, not equally with Math.",
    tests: ["PSAT"],
    verifiedAt: V,
  },
  {
    id: "cb-dates-deadlines",
    title: "SAT dates and deadlines",
    provider: "College Board",
    url: "https://satsuite.collegeboard.org/sat/dates-deadlines",
    kind: "reference",
    cost: "free",
    summary: "Test dates, registration deadlines, and late-registration windows. Check this before building any study plan.",
    tests: ["SAT"],
    verifiedAt: V,
  },
  {
    id: "cb-registration",
    title: "SAT registration",
    provider: "College Board",
    url: "https://satsuite.collegeboard.org/sat/registration",
    kind: "reference",
    cost: "free",
    summary: "How to register, what fee waivers cover, and what you need on test day.",
    tests: ["SAT"],
    verifiedAt: V,
  },
];
