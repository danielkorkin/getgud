// YouTube channels. Channel URLs rather than individual video links,
// deliberately: a specific video is the fastest thing on this shelf to rot
// (re-uploaded, made private, superseded when the test format changes),
// while a channel that has covered the digital SAT for years keeps being
// the right destination. See official.ts's header for the verification rule.
//
// Note on `@handle` URLs: they resolve only if the handle is exactly right,
// and one guessed handle in this file 404'd on first check, so each one
// here was fetched. Where a channel's handle was ambiguous, the immutable
// /channel/<id> form is used instead.

import type { Resource } from "./spec";

const V = "2026-09-17";

export const CHANNEL_RESOURCES: readonly Resource[] = [
  {
    id: "yt-khan-academy",
    title: "Khan Academy",
    provider: "YouTube",
    url: "https://www.youtube.com/@khanacademy",
    kind: "video-channel",
    cost: "free",
    summary:
      "The video layer of the official course, and the safest default: content is aligned with College Board because the two organizations built the prep program together.",
    tests: ["SAT", "PSAT"],
    featured: true,
    verifiedAt: V,
  },
  {
    id: "yt-supertutortv",
    title: "SupertutorTV",
    provider: "YouTube",
    url: "https://www.youtube.com/@SupertutorTV",
    kind: "video-channel",
    cost: "free",
    summary:
      "Brooke Hanson's channel — strategy, pacing, study schedules, and walkthroughs across both sections. Strongest on the meta-level questions: how to structure study time and how to decide what to skip.",
    tests: ["SAT", "PSAT"],
    featured: true,
    verifiedAt: V,
  },
  {
    id: "yt-scalar-learning",
    title: "Scalar Learning",
    provider: "YouTube",
    url: "https://www.youtube.com/@ScalarLearning",
    kind: "video-channel",
    cost: "free",
    summary:
      "Detailed math walkthroughs that usually show more than one route to the answer, which is exactly what you want when your method works but takes too long.",
    tests: ["SAT", "PSAT"],
    sectionCodes: ["MATH"],
    domainCodes: ["H", "P", "Q", "S"],
    featured: true,
    verifiedAt: V,
  },
  {
    id: "yt-penguin-test-prep",
    title: "Penguin Test Prep",
    provider: "YouTube",
    url: "https://www.youtube.com/channel/UC_UKOqQxVP6VaJDlg-X_DVw",
    kind: "video-channel",
    cost: "free",
    summary:
      "One of the few channels that treats Reading and Writing as seriously as math — grammar rules, passage strategy, and question-type breakdowns rather than math-only content.",
    tests: ["SAT", "PSAT"],
    sectionCodes: ["RW"],
    domainCodes: ["INI", "CAS", "EOI", "SEC"],
    featured: true,
    verifiedAt: V,
  },
  {
    id: "yt-organic-chemistry-tutor",
    title: "The Organic Chemistry Tutor",
    provider: "YouTube",
    url: "https://www.youtube.com/@TheOrganicChemistryTutor",
    kind: "video-channel",
    cost: "free",
    summary:
      "Not an SAT channel, but the best free explainer for the underlying math — trigonometry, quadratics, statistics, probability. Go here when a miss is a content gap rather than a test-taking problem.",
    tests: ["SAT", "PSAT"],
    sectionCodes: ["MATH"],
    domainCodes: ["H", "P", "Q", "S"],
    verifiedAt: V,
  },
  {
    id: "yt-strategic-test-prep",
    title: "Strategic Test Prep",
    provider: "YouTube",
    url: "https://www.youtube.com/@StrategicTestPrep",
    kind: "video-channel",
    cost: "free",
    summary: "Strategy-forward videos aimed at students trying to make a large score jump rather than polish a high one.",
    tests: ["SAT"],
    verifiedAt: V,
  },
  {
    id: "yt-1600io",
    title: "1600.io",
    provider: "YouTube",
    url: "https://www.youtube.com/@1600io",
    kind: "video-channel",
    cost: "freemium",
    summary: "The free portion of 1600.io's question-by-question explanations, including full official-test walkthroughs.",
    tests: ["SAT"],
    verifiedAt: V,
  },
  {
    id: "yt-prepscholar",
    title: "PrepScholar",
    provider: "YouTube",
    url: "https://www.youtube.com/@PrepScholar",
    kind: "video-channel",
    cost: "freemium",
    summary: "Short, targeted videos on individual question types and score strategy, from the company behind the PrepScholar blog.",
    tests: ["SAT"],
    verifiedAt: V,
  },
  {
    id: "yt-magoosh-sat",
    title: "Magoosh SAT",
    provider: "YouTube",
    url: "https://www.youtube.com/@MagooshSAT",
    kind: "video-channel",
    cost: "freemium",
    summary: "Concise lessons and worked problems, with a house style that stays closer to explanation than to hype.",
    tests: ["SAT"],
    verifiedAt: V,
  },
];
