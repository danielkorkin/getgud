// Structured courses — sequenced instruction you work through, as opposed
// to a channel you dip into. See official.ts's header for the URL
// verification rule that applies to this file too.

import type { Resource } from "./spec";

const V = "2026-09-17";

const ALL_MATH_DOMAINS = ["H", "P", "Q", "S"] as const;
const ALL_RW_DOMAINS = ["INI", "CAS", "EOI", "SEC"] as const;

export const COURSE_RESOURCES: readonly Resource[] = [
  {
    id: "khan-digital-sat",
    title: "Official Digital SAT Prep",
    provider: "Khan Academy",
    url: "https://www.khanacademy.org/test-prep/digital-sat",
    kind: "course",
    cost: "free-account",
    summary:
      "The full free course, built with College Board as its official practice partner: skill-by-skill lessons, video explanations, and practice grouped the same way the test's own domains are. If you only use one free resource, use this one.",
    tests: ["SAT", "PSAT"],
    featured: true,
    verifiedAt: V,
  },
  {
    id: "khan-sat-math",
    title: "Digital SAT Math course",
    provider: "Khan Academy",
    url: "https://www.khanacademy.org/test-prep/v2-sat-math",
    kind: "course",
    cost: "free-account",
    summary:
      "The math half on its own, organized by the same four domains the test reports — algebra, advanced math, problem-solving and data analysis, and geometry and trigonometry.",
    tests: ["SAT", "PSAT"],
    sectionCodes: ["MATH"],
    domainCodes: ALL_MATH_DOMAINS,
    featured: true,
    verifiedAt: V,
  },
  {
    id: "khan-sat-rw",
    title: "Digital SAT Reading and Writing course",
    provider: "Khan Academy",
    url: "https://www.khanacademy.org/test-prep/v2-sat-reading-and-writing",
    kind: "course",
    cost: "free-account",
    summary:
      "The Reading and Writing half, covering evidence and inference work alongside the grammar rules the Standard English Conventions questions test.",
    tests: ["SAT", "PSAT"],
    sectionCodes: ["RW"],
    domainCodes: ALL_RW_DOMAINS,
    featured: true,
    verifiedAt: V,
  },
  {
    id: "schoolhouse-sat-bootcamp",
    title: "SAT Bootcamp — free live tutoring",
    provider: "schoolhouse.world",
    url: "https://schoolhouse.world/sat-bootcamp",
    kind: "course",
    cost: "free-account",
    summary:
      "Free small-group SAT tutoring over video, run by vetted peer tutors, in a College Board–recognized program. The rarest thing on this shelf: live human help at no cost.",
    tests: ["SAT"],
    featured: true,
    verifiedAt: V,
  },
  {
    id: "schoolhouse-world",
    title: "schoolhouse.world",
    provider: "schoolhouse.world",
    url: "https://schoolhouse.world/",
    kind: "community",
    cost: "free-account",
    summary: "The wider platform behind the SAT bootcamp — free peer tutoring across math and other subjects, useful for shoring up the underlying algebra.",
    tests: ["SAT", "PSAT"],
    verifiedAt: V,
  },
  {
    id: "khan-algebra",
    title: "Algebra 1 (foundations)",
    provider: "Khan Academy",
    url: "https://www.khanacademy.org/math/algebra",
    kind: "course",
    cost: "free-account",
    summary:
      "Not SAT-specific — the underlying algebra. Work here instead of on test strategy if linear equations and systems are the thing going wrong, because no amount of pacing advice fixes a shaky foundation.",
    tests: ["SAT", "PSAT"],
    sectionCodes: ["MATH"],
    domainCodes: ["H"],
    skillCodes: ["H.A.", "H.B.", "H.C.", "H.D.", "H.E."],
    verifiedAt: V,
  },
  {
    id: "khan-geometry",
    title: "Geometry (foundations)",
    provider: "Khan Academy",
    url: "https://www.khanacademy.org/math/geometry",
    kind: "course",
    cost: "free-account",
    summary:
      "The geometry and trigonometry background the test assumes: triangles, circles, angle relationships, area and volume.",
    tests: ["SAT", "PSAT"],
    sectionCodes: ["MATH"],
    domainCodes: ["S"],
    skillCodes: ["S.A.", "S.B.", "S.C.", "S.D."],
    verifiedAt: V,
  },
  {
    id: "1600io",
    title: "1600.io",
    provider: "1600.io",
    url: "https://1600.io/",
    kind: "course",
    cost: "freemium",
    summary:
      "Exhaustive video explanations of official test questions, question by question, plus a strategy course. The free bundle is substantial; the depth per question is the selling point, so it suits people who want to understand a miss completely rather than move on.",
    tests: ["SAT"],
    verifiedAt: V,
  },
];
