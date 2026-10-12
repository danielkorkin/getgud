// Deterministic, read-only selection of question ids for a premade exam
// blueprint (src/exams/*.ts). Never writes into src/ or the database — it
// prints a module x domain x skill x difficulty x type summary table for
// human review, followed by a paste-ready TS object literal you copy into
// the blueprint file by hand. Re-running with the same --seed reproduces
// the same selection (barring bank changes from a re-scrape).
//
//   pnpm design:exam --exam=sat-practice-1 --seed=getgud-sat-practice-1
//   pnpm design:exam --exam=sat-practice-1 --verify   (re-checks a committed blueprint)
//
// Determinism note: `ORDER BY random()` + `setseed()` is NOT reliable here
// — db.runtime().query() goes through a pg.Pool, and setseed() is
// session-scoped, so two statements aren't guaranteed the same connection.
// `md5(seed || id)` is a stable pseudo-random total order that doesn't
// depend on session state.
//
// The domain/band/SPR/skill targets below are a reasoned design, not a
// script parameter — see CLAUDE.md and the exam plan for how each number
// traces back to College Board's published Assessment Framework shares (or,
// for sat-practice-2's skill/hard-Module-2 tilts, to 2026 test-day recap
// themes — see that design's own comment below). They are written out
// explicitly (not derived by proportional rounding) so the selection is
// exactly reproducible and easy to eyeball. Each committed exam's design
// lives under its own key in `DESIGNS` (keyed by exam id) — adding a new
// exam means adding a new key, never editing another exam's existing one.

import { param } from "@prisma/orm-postgres/relational-core";
import { db } from "../src/prisma/db";
import { RESERVED_QUESTION_IDS, getExam, EXAMS } from "../src/exams";
import { validateBlueprint } from "../src/exams/spec";

type SectionCode = "RW" | "MATH";
type ModuleName = "module1" | "module2Lower" | "module2Upper";

interface Candidate {
  id: string;
  type: "mcq" | "spr";
  domainCode: string;
  skillCode: string;
  scoreBand: number;
  templateClusterId: string | null;
  parentTemplateId: string | null;
}

/** Explicit per-domain, per-band question counts for one module. Sums to the module's total count. */
interface DomainBandTargets {
  [domain: string]: Partial<Record<number, number>>;
}

interface ModuleDesign {
  count: number;
  domainOrder: string[];
  domainBandTargets: DomainBandTargets;
  /** MATH only — per-domain SPR sub-quota, drawn from that domain's band allocation. Omit/empty for RW. */
  domainSprTargets?: Record<string, number>;
  /**
   * Optional per-domain skill sub-quota (RW or MATH): domainCode -> skillCode
   * -> exact target count, summing to that domain's total (the sum of its
   * domainBandTargets). When a domain has an entry here, `selectModule` uses
   * a quota-respecting weighted round-robin over these targets instead of
   * the default rarest-skill-first spread — see `buildQuotaRotationOrder`.
   * A domain with no entry keeps today's rarity-based behavior untouched.
   */
  domainSkillTargets?: Record<string, Record<string, number>>;
  /**
   * Optional RW layout override: ordered skill groups. Each inner array is one
   * contiguous block in the module; within a block, items sort by scoreBand
   * ascending (then id). A block with several skills (e.g. ["BOU","FSS"])
   * mixes them by difficulty, which is how the real test lays out Standard
   * English Conventions. When unset, layout is domain order then band — what
   * the SAT designs have always used.
   */
  skillOrder?: string[][];
  /**
   * Opt-in (RW only, no SPR): honor `domainSkillTargets` exactly instead of
   * the rotation's best effort. Assigns skills to the domain's band slots
   * rarest-skill-first, each to the open slot nearest a band where that skill
   * actually has an available item, so a thin skill (e.g. Cross-Text
   * Connections) isn't silently dropped. Unset, selection is unchanged.
   */
  strictSkillQuota?: boolean;
  /**
   * Optional MATH layout override: exact 1-indexed positions of the SPR items.
   * Must have exactly as many entries as the module ends up with SPR picks,
   * otherwise the proportional-tail default applies.
   */
  sprPositions?: number[];
}

function sumTargets(t: DomainBandTargets): number {
  let total = 0;
  for (const byBand of Object.values(t)) {
    for (const count of Object.values(byBand)) {
      total += count ?? 0;
    }
  }
  return total;
}

function domainTotal(t: DomainBandTargets, domain: string): number {
  let total = 0;
  for (const count of Object.values(t[domain] ?? {})) total += count ?? 0;
  return total;
}

// ── RW module designs (27 questions each) ──────────────────────────────────
// Domain order matches College Board's fixed sequence: Craft and Structure
// -> Information and Ideas -> Standard English Conventions -> Expression
// of Ideas. Domain counts approximate AF Table 10's per-section shares
// (C&S ~28%, I&I ~26%, SEC ~26%, EoI ~20%) halved per module: 8/7/7/5=27.
const RW_DOMAIN_ORDER = ["CAS", "INI", "SEC", "EOI"];

const RW_MODULE_1: ModuleDesign = {
  count: 27,
  domainOrder: RW_DOMAIN_ORDER,
  // Routing instrument — roughly balanced across all 7 bands.
  domainBandTargets: {
    CAS: { 1: 1, 2: 1, 3: 1, 4: 2, 5: 1, 6: 1, 7: 1 }, // 8
    INI: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 }, // 7
    SEC: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 }, // 7
    EOI: { 1: 1, 2: 1, 3: 1, 5: 1, 6: 1 }, // 5
  },
};
const RW_MODULE_2_LOWER: ModuleDesign = {
  count: 27,
  domainOrder: RW_DOMAIN_ORDER,
  // Skewed easy: bands 1-4 carry most of the weight.
  domainBandTargets: {
    CAS: { 1: 2, 2: 2, 3: 2, 4: 1, 6: 1 }, // 8
    INI: { 1: 2, 2: 2, 3: 1, 4: 1, 5: 1 }, // 7
    SEC: { 1: 2, 2: 1, 3: 2, 4: 1, 5: 1 }, // 7
    EOI: { 1: 1, 2: 2, 3: 1, 4: 1 }, // 5
  },
};
const RW_MODULE_2_UPPER: ModuleDesign = {
  count: 27,
  domainOrder: RW_DOMAIN_ORDER,
  // Skewed hard: bands 4-7 carry most of the weight.
  domainBandTargets: {
    CAS: { 3: 1, 4: 1, 5: 2, 6: 2, 7: 2 }, // 8
    INI: { 4: 1, 5: 2, 6: 2, 7: 2 }, // 7
    SEC: { 4: 1, 5: 1, 6: 3, 7: 2 }, // 7
    EOI: { 4: 1, 5: 1, 6: 1, 7: 2 }, // 5
  },
};

// ── MATH module designs (22 questions each) ─────────────────────────────────
// Domain shares approximate AF Table 16 (Algebra ~35%, Advanced Math ~35%,
// PSDA ~15%, Geometry & Trig ~15%): 8/8/3/3=22. SPR count (6, ~27%) and its
// per-domain split approximate AF Table 20's MC/SPR breakdown.
const MATH_DOMAIN_ORDER = ["H", "P", "Q", "S"];

const MATH_MODULE_1: ModuleDesign = {
  count: 22,
  domainOrder: MATH_DOMAIN_ORDER,
  domainBandTargets: {
    H: { 1: 1, 2: 1, 3: 1, 4: 2, 5: 1, 6: 1, 7: 1 }, // 8
    P: { 1: 1, 2: 1, 3: 1, 4: 2, 5: 1, 6: 1, 7: 1 }, // 8
    Q: { 2: 1, 4: 1, 6: 1 }, // 3
    S: { 3: 1, 4: 1, 5: 1 }, // 3
  },
  domainSprTargets: { H: 2, P: 2, Q: 1, S: 1 },
};
const MATH_MODULE_2_LOWER: ModuleDesign = {
  count: 22,
  domainOrder: MATH_DOMAIN_ORDER,
  domainBandTargets: {
    H: { 1: 2, 2: 2, 3: 1, 4: 2, 5: 1 }, // 8
    P: { 1: 2, 2: 2, 3: 2, 4: 1, 5: 1 }, // 8
    Q: { 1: 1, 2: 1, 4: 1 }, // 3
    S: { 1: 1, 2: 1, 3: 1 }, // 3
  },
  domainSprTargets: { H: 2, P: 2, Q: 1, S: 1 },
};
const MATH_MODULE_2_UPPER: ModuleDesign = {
  count: 22,
  domainOrder: MATH_DOMAIN_ORDER,
  domainBandTargets: {
    H: { 3: 1, 4: 2, 5: 1, 6: 2, 7: 2 }, // 8
    P: { 4: 1, 5: 2, 6: 2, 7: 3 }, // 8
    Q: { 4: 1, 6: 1, 7: 1 }, // 3
    S: { 5: 1, 6: 1, 7: 1 }, // 3
  },
  domainSprTargets: { H: 2, P: 2, Q: 1, S: 1 },
};

const SAT_PRACTICE_1_SECTIONS: Record<SectionCode, Record<ModuleName, ModuleDesign>> = {
  RW: { module1: RW_MODULE_1, module2Lower: RW_MODULE_2_LOWER, module2Upper: RW_MODULE_2_UPPER },
  MATH: { module1: MATH_MODULE_1, module2Lower: MATH_MODULE_2_LOWER, module2Upper: MATH_MODULE_2_UPPER },
};

// ── sat-practice-2 ──────────────────────────────────────────────────────────
// Same official-blueprint shape as sat-practice-1 (domain counts, module1 and
// module2Lower band curves, SPR counts, timing) — this is deliberately NOT a
// harder-difficulty test overall. Two things differ, both informed by 2026
// test-day recap themes (informal, vendor/student-recall sourced, form-
// dependent — NOT official College Board data; see sat-practice-2.ts's file
// comment):
//   1. `domainSkillTargets` tilts the within-domain skill mix for the four
//      domains the recaps repeatedly single out — RW's CAS (vocabulary/Words
//      in Context) and EOI (transitions over rhetorical synthesis), Math's H
//      (mild systems/linear-function tilt) and P (heavy nonlinear-function
//      tilt). Every other domain (RW's INI/SEC, Math's Q/S) is left unset —
//      no clear per-skill signal in the recaps, or (Q/S) too few slots (3)
//      to sub-target without starving skills the recaps don't single out.
//      Deliberately NOT upweighting Q.F (margin of error) — recap evidence
//      for that specific claim was explicitly absent.
//   2. module2Upper's band curve (both sections) is hardened relative to
//      sat-practice-1 — "the real test feels harder than Bluebook, especially
//      Module 2" is the one pattern the recaps flag as recurring across many
//      independent test dates. module1 and module2Lower keep sat-practice-1's
//      exact band curves so the routing threshold isn't being second-guessed
//      by a difficulty change underneath it.
const RW_MODULE_1_V2: ModuleDesign = {
  ...RW_MODULE_1,
  domainSkillTargets: {
    CAS: { WIC: 5, TSP: 2, CTC: 1 }, // vocabulary-heavy Craft & Structure
    EOI: { TRA: 3, SYN: 2 }, // transitions over rhetorical synthesis
  },
};
const RW_MODULE_2_LOWER_V2: ModuleDesign = {
  ...RW_MODULE_2_LOWER,
  domainSkillTargets: {
    CAS: { WIC: 5, TSP: 2, CTC: 1 },
    EOI: { TRA: 3, SYN: 2 },
  },
};
const RW_MODULE_2_UPPER_V2: ModuleDesign = {
  count: 27,
  domainOrder: RW_DOMAIN_ORDER,
  // Hardened vs. sat-practice-1's {3:1,4:4,5:6,6:8,7:8} (col sums {4:2,5:5,
  // 6:9,7:11}, still 27) — "Module 2 feels harder than Bluebook" recap theme.
  domainBandTargets: {
    CAS: { 4: 1, 5: 1, 6: 3, 7: 3 }, // 8
    INI: { 4: 1, 5: 1, 6: 3, 7: 2 }, // 7
    SEC: { 5: 1, 6: 2, 7: 4 }, // 7
    EOI: { 5: 2, 6: 1, 7: 2 }, // 5
  },
  domainSkillTargets: {
    CAS: { WIC: 5, TSP: 2, CTC: 1 },
    EOI: { TRA: 3, SYN: 2 },
  },
};

const MATH_MODULE_1_V2: ModuleDesign = {
  ...MATH_MODULE_1,
  domainSkillTargets: {
    H: { "H.A.": 1, "H.B.": 2, "H.C.": 2, "H.D.": 2, "H.E.": 1 }, // mild systems/linear-function tilt
    P: { "P.A.": 1, "P.B.": 3, "P.C.": 4 }, // heavy nonlinear-function/equation tilt
  },
};
const MATH_MODULE_2_LOWER_V2: ModuleDesign = {
  ...MATH_MODULE_2_LOWER,
  domainSkillTargets: {
    H: { "H.A.": 1, "H.B.": 2, "H.C.": 2, "H.D.": 2, "H.E.": 1 },
    P: { "P.A.": 1, "P.B.": 3, "P.C.": 4 },
  },
};
const MATH_MODULE_2_UPPER_V2: ModuleDesign = {
  count: 22,
  domainOrder: MATH_DOMAIN_ORDER,
  // Hardened vs. sat-practice-1's {3:1,4:4,5:4,6:6,7:7} (col sums {4:2,5:4,
  // 6:7,7:9}, still 22) — same "harder Module 2" recap theme as RW above.
  domainBandTargets: {
    H: { 4: 1, 5: 2, 6: 2, 7: 3 }, // 8
    P: { 4: 1, 5: 1, 6: 3, 7: 3 }, // 8
    Q: { 5: 1, 6: 1, 7: 1 }, // 3
    S: { 6: 1, 7: 2 }, // 3
  },
  domainSprTargets: { H: 2, P: 2, Q: 1, S: 1 },
  domainSkillTargets: {
    H: { "H.A.": 1, "H.B.": 2, "H.C.": 2, "H.D.": 2, "H.E.": 1 },
    P: { "P.A.": 1, "P.B.": 3, "P.C.": 4 },
  },
};

const SAT_PRACTICE_2_SECTIONS: Record<SectionCode, Record<ModuleName, ModuleDesign>> = {
  RW: { module1: RW_MODULE_1_V2, module2Lower: RW_MODULE_2_LOWER_V2, module2Upper: RW_MODULE_2_UPPER_V2 },
  MATH: { module1: MATH_MODULE_1_V2, module2Lower: MATH_MODULE_2_LOWER_V2, module2Upper: MATH_MODULE_2_UPPER_V2 },
};

// ── psat-practice-1 ─────────────────────────────────────────────────────────
// Digital PSAT/NMSQT & PSAT 10. Same module lengths/timing as the SAT, but:
//   - MATH domain mix follows College Board's PSAT alignment table (Algebra
//     ~35%, Advanced Math ~32.5%, PSDA ~20%, Geometry & Trig ~12.5%) rather
//     than the SAT's 35/35/15/15: Module 1 is 8/7/4/3, each Module 2 is
//     7/7/5/3 (section totals 15/14/9/6 of 44 = 34/32/20/14%).
//   - RW keeps 8/7/7/5 (the same shares across the whole SAT Suite) but lays
//     out by SKILL GROUP, ascending difficulty within each group — the real
//     test's order — via `skillOrder`, instead of by domain.
//   - MATH SPR items sit at 5,6,11,12,17,22 of 22 — College Board's official
//     PSAT answer key puts them at 6,7,13,14,20,21,27 of 27 (6 per 22). The
//     SPR items are picked at the difficulty of the position they occupy
//     (`sprBandQuota`), so the module still ramps easy -> hard end to end.
//   - Band curves reuse sat-practice-1's column shapes (scoreBand is
//     PSAT-specific in the bank, so the curves stay meaningful).
// The PSAT bank has no Q.G / S.D rows and its Q.F / S.C are PSAT-scoped, so
// querying assessment = 'PSAT/NMSQT & PSAT 10' already enforces PSAT content.
const PSAT_RW_SKILL_ORDER = [["WIC"], ["TSP"], ["CTC"], ["CID"], ["COE.T"], ["COE.Q"], ["INF"], ["BOU", "FSS"], ["TRA"], ["SYN"]];
const PSAT_MATH_SPR_POSITIONS = [5, 6, 11, 12, 17, 22];

function psatRw(base: ModuleDesign, secSkills: Record<string, number>, eoiSkills: Record<string, number>): ModuleDesign {
  return {
    ...base,
    skillOrder: PSAT_RW_SKILL_ORDER,
    strictSkillQuota: true,
    domainSkillTargets: {
      CAS: { WIC: 4, TSP: 3, CTC: 1 },
      INI: { CID: 2, "COE.T": 1, "COE.Q": 2, INF: 2 },
      SEC: secSkills,
      EOI: eoiSkills,
    },
  };
}
const PSAT_MATH_DOMAIN_ORDER = MATH_DOMAIN_ORDER;
const PSAT_MATH_MODULE_1: ModuleDesign = {
  count: 22,
  domainOrder: PSAT_MATH_DOMAIN_ORDER,
  domainBandTargets: {
    H: { 1: 1, 2: 1, 3: 1, 4: 2, 5: 1, 6: 1, 7: 1 }, // 8
    P: { 1: 1, 2: 1, 3: 1, 4: 2, 5: 1, 7: 1 }, // 7
    Q: { 2: 1, 4: 1, 5: 1, 6: 1 }, // 4
    S: { 3: 1, 4: 1, 5: 1 }, // 3
  },
  sprPositions: PSAT_MATH_SPR_POSITIONS,
};
const PSAT_MATH_MODULE_2_LOWER: ModuleDesign = {
  count: 22,
  domainOrder: PSAT_MATH_DOMAIN_ORDER,
  domainBandTargets: {
    H: { 1: 2, 2: 2, 3: 1, 4: 1, 5: 1 }, // 7
    P: { 1: 2, 2: 2, 3: 1, 4: 1, 5: 1 }, // 7
    Q: { 1: 1, 2: 1, 3: 1, 4: 2 }, // 5
    S: { 1: 1, 2: 1, 3: 1 }, // 3
  },
  sprPositions: PSAT_MATH_SPR_POSITIONS,
};
const PSAT_MATH_MODULE_2_UPPER: ModuleDesign = {
  count: 22,
  domainOrder: PSAT_MATH_DOMAIN_ORDER,
  domainBandTargets: {
    H: { 3: 1, 4: 1, 5: 1, 6: 2, 7: 2 }, // 7
    P: { 4: 1, 5: 1, 6: 2, 7: 3 }, // 7
    Q: { 4: 1, 5: 1, 6: 1, 7: 2 }, // 5
    S: { 4: 1, 5: 1, 6: 1 }, // 3
  },
  sprPositions: PSAT_MATH_SPR_POSITIONS,
};

const PSAT_PRACTICE_1_SECTIONS: Record<SectionCode, Record<ModuleName, ModuleDesign>> = {
  RW: {
    module1: psatRw(RW_MODULE_1, { BOU: 4, FSS: 3 }, { TRA: 2, SYN: 3 }),
    module2Lower: psatRw(RW_MODULE_2_LOWER, { BOU: 3, FSS: 4 }, { TRA: 3, SYN: 2 }),
    module2Upper: psatRw(RW_MODULE_2_UPPER, { BOU: 3, FSS: 4 }, { TRA: 3, SYN: 2 }),
  },
  MATH: { module1: PSAT_MATH_MODULE_1, module2Lower: PSAT_MATH_MODULE_2_LOWER, module2Upper: PSAT_MATH_MODULE_2_UPPER },
};

// Design intent, keyed by exam id — NOT a CLI parameter (see the module
// comment). `sat-practice-1`'s entry is untouched by the sat-practice-2 work
// above; regenerating it with the same seed must still reproduce the exact
// committed ids.
const DESIGNS: Record<string, Record<SectionCode, Record<ModuleName, ModuleDesign>>> = {
  "sat-practice-1": SAT_PRACTICE_1_SECTIONS,
  "sat-practice-2": SAT_PRACTICE_2_SECTIONS,
  "psat-practice-1": PSAT_PRACTICE_1_SECTIONS,
};

// Which `question_assessment.assessment` each design draws from. Anything not
// listed here is an SAT design — the original (and only) behavior.
const PSAT = "PSAT/NMSQT & PSAT 10";
const DESIGN_ASSESSMENT: Record<string, string> = {
  "psat-practice-1": PSAT,
};
function assessmentFor(examId: string): string {
  return DESIGN_ASSESSMENT[examId] ?? "SAT";
}

// Sanity-check the hand-authored designs at load time — a typo here would
// otherwise silently produce a module short of its contractual count, or a
// domainSkillTargets that doesn't actually cover its domain's slots.
for (const [examId, sections] of Object.entries(DESIGNS)) {
  for (const [sectionCode, modules] of Object.entries(sections)) {
    for (const [moduleName, design] of Object.entries(modules)) {
      const sum = sumTargets(design.domainBandTargets);
      if (sum !== design.count) {
        throw new Error(`${examId}.${sectionCode}.${moduleName}: domainBandTargets sums to ${sum}, expected ${design.count}`);
      }
      for (const [domain, skillTargets] of Object.entries(design.domainSkillTargets ?? {})) {
        const skillSum = Object.values(skillTargets).reduce((a, b) => a + b, 0);
        const expected = domainTotal(design.domainBandTargets, domain);
        if (skillSum !== expected) {
          throw new Error(
            `${examId}.${sectionCode}.${moduleName}.${domain}: domainSkillTargets sums to ${skillSum}, expected domain total ${expected}`,
          );
        }
      }
    }
  }
}

function parseArgs(argv: string[]): { exam: string; seed: string; verify: boolean } {
  const args = Object.fromEntries(
    argv
      .filter((a) => a.startsWith("--"))
      .map((a) => {
        const [k, v] = a.slice(2).split("=");
        return [k, v ?? "true"];
      }),
  );
  const exam = args.exam ?? "sat-practice-1";
  const seed = args.seed ?? `getgud-${exam}`;
  const verify = args.verify === "true";
  return { exam, seed, verify };
}

async function fetchCandidates(
  sectionCode: SectionCode,
  seed: string,
  excludeIds: readonly string[],
  assessment: string,
): Promise<Candidate[]> {
  // Excludes every id already claimed by a DIFFERENT registered blueprint
  // (src/exams/index.ts) — load-bearing when designing a SECOND (or later)
  // exam: without this, the selection could reuse an id from
  // sat-practice-1/sat-smoke, which then fails both
  // `pnpm design:exam --verify` and the registry's own load-time assertion
  // (every blueprint must use disjoint ids). `excludeIds` deliberately
  // omits the current --exam's OWN ids when re-designing an exam that's
  // already registered — see runDesign — so regenerating sat-practice-1 is
  // free to reuse (or drop) any of its own current ids, not just leftovers.
  const plan = db.raw
    .sql`
      SELECT
        q.id,
        q.type,
        qa."domainCode",
        qa."skillCode",
        qa."scoreBand",
        q."templateClusterId",
        q."parentTemplateId",
        (q.stimulus ~* '<table|<svg|<img|<figure') AS quantitative
      FROM question q
      JOIN question_assessment qa ON qa."questionId" = q.id
      WHERE qa.assessment = ${assessment}
        AND qa."sectionCode" = ${sectionCode}
        AND cardinality(q."correctAnswer") > 0
        AND q.rationale IS NOT NULL
        AND q."hasEmbeddedMathImages" = false
        AND NOT (q.id = ANY(${param([...excludeIds], { codecId: "pg/text@1" })}))
      ORDER BY md5(${seed} || q.id)
    `
    .returnsRow({
      id: "pg/text@1",
      type: "pg/text@1",
      domainCode: "pg/text@1",
      skillCode: "pg/text@1",
      scoreBand: "pg/int4@1",
      templateClusterId: "pg/text@1",
      parentTemplateId: "pg/text@1",
      quantitative: "pg/bool@1",
    } as const)
    .build();
  const rows = await db.runtime().query(plan);
  // PSAT designs split Command of Evidence into textual (COE.T) and
  // quantitative/graphic (COE.Q) pseudo-skills, because the real test places
  // all textual items before all quantitative ones. SAT designs never
  // reference these keys, so they keep the raw skill code.
  const splitCoe = assessment === PSAT;
  return rows.map((r) => ({
    id: r.id,
    type: r.type as "mcq" | "spr",
    domainCode: r.domainCode,
    skillCode: splitCoe && r.skillCode === "COE" ? (r.quantitative ? "COE.Q" : "COE.T") : r.skillCode,
    scoreBand: r.scoreBand,
    templateClusterId: r.templateClusterId,
    parentTemplateId: r.parentTemplateId,
  }));
}

interface SelectionState {
  used: Set<string>;
  claimedClusters: Set<string>;
}

function isAvailable(c: Candidate, state: SelectionState): boolean {
  if (state.used.has(c.id)) return false;
  if (c.templateClusterId && state.claimedClusters.has(c.templateClusterId)) return false;
  if (c.parentTemplateId && state.claimedClusters.has(c.parentTemplateId)) return false;
  return true;
}

function claim(c: Candidate, state: SelectionState): void {
  state.used.add(c.id);
  if (c.templateClusterId) state.claimedClusters.add(c.templateClusterId);
  if (c.parentTemplateId) state.claimedClusters.add(c.parentTemplateId);
}

/**
 * Skills within a domain, rarest-available-first. Computed once per domain
 * (not per pick) — a `SkillRotation` then cycles through this fixed order
 * so thin skills get first refusal on a domain's very first pick without
 * dominating every subsequent one (see the module comment for why: a
 * skill that's merely "rarest among what's left" stays rarest across many
 * picks if we re-rank on every single pick, which starves the other
 * skills in the domain instead of just protecting the thin one).
 */
function rankSkillsByRarity(pool: Candidate[], domain: string): string[] {
  const bySkill = new Map<string, number>();
  for (const c of pool) {
    if (c.domainCode !== domain) continue;
    bySkill.set(c.skillCode, (bySkill.get(c.skillCode) ?? 0) + 1);
  }
  return [...bySkill.entries()].sort((a, b) => a[1] - b[1]).map(([skill]) => skill);
}

/**
 * Skill rotation order for a domain with explicit `domainSkillTargets` — a
 * weighted round-robin over the requested quotas (interleaved, e.g.
 * `WIC,TSP,WIC,CTC,WIC,TSP,WIC,WIC`, never blocked as `WIC×5,TSP×2,CTC×1`)
 * so a thin quota isn't crowded to one end of the domain's picks. Skills are
 * read in sorted-by-code order first so ties resolve deterministically
 * regardless of the source object's declaration order — that ordering is
 * then part of the committed exam's reproducibility contract, same as any
 * other design constant here. At each step, picks whichever skill has made
 * the least proportional progress toward its own quota (issued/target),
 * ties broken by sorted-code order.
 */
function buildQuotaRotationOrder(skillTargets: Record<string, number>): string[] {
  const skills = Object.keys(skillTargets).sort();
  const remaining = new Map(skills.map((s) => [s, skillTargets[s] ?? 0]));
  const issued = new Map(skills.map((s) => [s, 0]));
  const total = skills.reduce((sum, s) => sum + (skillTargets[s] ?? 0), 0);
  const order: string[] = [];
  for (let i = 0; i < total; i++) {
    let best: string | null = null;
    let bestRatio = Infinity;
    for (const s of skills) {
      if ((remaining.get(s) ?? 0) <= 0) continue;
      const ratio = (issued.get(s) ?? 0) / (skillTargets[s] ?? 1);
      if (best === null || ratio < bestRatio) {
        best = s;
        bestRatio = ratio;
      }
    }
    if (!best) break; // shouldn't happen if `remaining` sums correctly
    order.push(best);
    remaining.set(best, (remaining.get(best) ?? 0) - 1);
    issued.set(best, (issued.get(best) ?? 0) + 1);
  }
  return order;
}

interface SkillRotation {
  order: string[];
  index: number;
}

interface PickResult {
  picked: Candidate[];
  short: string[];
}

/**
 * Strict skill-quota pick for one domain (see ModuleDesign.strictSkillQuota).
 * Band slots come from `bandTargets`; every skill's quota is placed into a
 * slot before any item is chosen, so scarcity decides placement, not rotation
 * order.
 */
function pickStrictQuota(
  pool: Candidate[],
  domain: string,
  bandTargets: Partial<Record<number, number>>,
  skillTargets: Record<string, number>,
  state: SelectionState,
): PickResult {
  const slots: { band: number; skill: string | null }[] = [];
  for (const band of Object.keys(bandTargets).map(Number).sort((a, b) => a - b)) {
    for (let i = 0; i < (bandTargets[band] ?? 0); i++) slots.push({ band, skill: null });
  }
  const supply = (skill: string) => pool.filter((c) => c.domainCode === domain && c.skillCode === skill && isAvailable(c, state));
  const skills = Object.keys(skillTargets).sort();
  const supplyBands = new Map(skills.map((sk) => [sk, new Set(supply(sk).map((c) => c.scoreBand))]));
  const supplySize = new Map(skills.map((sk) => [sk, supply(sk).length]));
  const remaining = new Map(skills.map((sk) => [sk, skillTargets[sk] ?? 0]));
  const issued = new Map(skills.map((sk) => [sk, 0]));
  // Walk the slots easiest-to-hardest and give each to whichever skill is
  // furthest behind its quota (issued/target) among skills that have an item at
  // that exact band — so skills interleave across the difficulty range instead
  // of clumping. A skill whose remaining quota equals the number of open slots
  // it can still fill is forced first (this is what keeps a thin skill, e.g.
  // Cross-Text Connections, from being squeezed out). If nothing has supply at
  // a slot's band, the skill with the nearest supply band takes it.
  slots.forEach((slot, idx) => {
    const open = slots.slice(idx);
    const eligible = skills.filter((sk) => (remaining.get(sk) ?? 0) > 0);
    const has = (sk: string, band: number) => supplyBands.get(sk)!.has(band);
    const feasible = (sk: string) => open.filter((o) => has(sk, o.band)).length;
    const forced = eligible.filter((sk) => has(sk, slot.band) && feasible(sk) <= (remaining.get(sk) ?? 0));
    let candidates = forced.length > 0 ? forced : eligible.filter((sk) => has(sk, slot.band));
    if (candidates.length === 0) {
      const dist = (sk: string) => Math.min(...[...supplyBands.get(sk)!].map((b) => Math.abs(b - slot.band)), 99);
      const best = Math.min(...eligible.map(dist));
      candidates = eligible.filter((sk) => dist(sk) === best);
    }
    candidates.sort(
      (x, y) =>
        (issued.get(x)! / skillTargets[x]!) - (issued.get(y)! / skillTargets[y]!) ||
        supplySize.get(x)! - supplySize.get(y)! ||
        x.localeCompare(y),
    );
    const chosen = candidates[0]!;
    slot.skill = chosen;
    remaining.set(chosen, remaining.get(chosen)! - 1);
    issued.set(chosen, issued.get(chosen)! + 1);
  });
  const picked: Candidate[] = [];
  const short: string[] = [];
  for (const slot of slots) {
    let candidate: Candidate | null = null;
    for (let delta = 0; delta <= 6 && !candidate; delta++) {
      for (const b of delta === 0 ? [slot.band] : [slot.band - delta, slot.band + delta]) {
        candidate =
          pool.find((c) => c.domainCode === domain && c.skillCode === slot.skill && c.scoreBand === b && isAvailable(c, state)) ?? null;
        if (candidate) break;
      }
    }
    if (candidate) {
      picked.push(candidate);
      claim(candidate, state);
    } else {
      short.push(`${domain} ${slot.skill} band ${slot.band}`);
    }
  }
  return { picked, short };
}

function pickForDomainBand(
  pool: Candidate[],
  domain: string,
  band: number,
  count: number,
  state: SelectionState,
  preferSpr: boolean,
  rotation: SkillRotation,
): PickResult {
  const picked: Candidate[] = [];
  const short: string[] = [];
  for (let i = 0; i < count; i++) {
    let candidate: Candidate | null = null;
    // Exact band match, cycling the domain's skill rotation forward by one
    // on every attempt (success or not) so consecutive picks spread across
    // skills instead of re-locking onto whichever skill is rarest overall.
    for (let attempt = 0; attempt < rotation.order.length && !candidate; attempt++) {
      const skill = rotation.order[(rotation.index + attempt) % rotation.order.length]!;
      for (const wantType of preferSpr ? (["spr", "mcq"] as const) : (["mcq", "spr"] as const)) {
        candidate =
          pool.find((c) => c.domainCode === domain && c.skillCode === skill && c.scoreBand === band && c.type === wantType && isAvailable(c, state)) ??
          null;
        if (candidate) break;
      }
    }
    rotation.index++;
    // Nearest-band fallback within the same domain, expanding outward.
    if (!candidate) {
      for (let delta = 1; delta <= 6 && !candidate; delta++) {
        for (const b of [band - delta, band + delta]) {
          if (b < 1 || b > 7) continue;
          candidate = pool.find((c) => c.domainCode === domain && c.scoreBand === b && isAvailable(c, state)) ?? null;
          if (candidate) break;
        }
      }
    }
    if (candidate) {
      picked.push(candidate);
      claim(candidate, state);
    } else {
      short.push(`${domain} band ${band}`);
    }
  }
  return { picked, short };
}

/** Cross-domain backfill for slots a domain's own pool couldn't fill — pulls from anywhere in the section, closest band first. */
function backfillFromSection(pool: Candidate[], band: number, count: number, state: SelectionState): PickResult {
  const picked: Candidate[] = [];
  const short: string[] = [];
  for (let i = 0; i < count; i++) {
    let candidate: Candidate | null = null;
    for (let delta = 0; delta <= 6 && !candidate; delta++) {
      for (const b of delta === 0 ? [band] : [band - delta, band + delta]) {
        if (b < 1 || b > 7) continue;
        candidate = pool.find((c) => c.scoreBand === b && isAvailable(c, state)) ?? null;
        if (candidate) break;
      }
    }
    if (candidate) {
      picked.push(candidate);
      claim(candidate, state);
    } else {
      short.push(`section-wide band ~${band}`);
    }
  }
  return { picked, short };
}

interface ModuleResult {
  ids: string[];
  candidates: Candidate[];
  shortfalls: string[];
}

/**
 * With explicit `sprPositions`, the SPR items must also fit the module's
 * difficulty ramp: the item landing at an SPR position should have the band
 * an ascending-by-difficulty module has at that position. Returns how many SPR
 * items each band needs.
 */
function sprBandQuota(design: ModuleDesign): Record<number, number> {
  const bands: number[] = [];
  for (const byBand of Object.values(design.domainBandTargets)) {
    for (const [band, count] of Object.entries(byBand)) for (let i = 0; i < (count ?? 0); i++) bands.push(Number(band));
  }
  bands.sort((a, b) => a - b);
  const quota: Record<number, number> = {};
  for (const pos of design.sprPositions ?? []) {
    const b = bands[pos - 1]!;
    quota[b] = (quota[b] ?? 0) + 1;
  }
  return quota;
}

function selectModule(pool: Candidate[], design: ModuleDesign, state: SelectionState): ModuleResult {
  const shortfalls: string[] = [];
  const bandSprQuota = design.sprPositions ? sprBandQuota(design) : null;
  const selectedByDomain = new Map<string, Candidate[]>();

  for (const domain of design.domainOrder) {
    const bandTargets = design.domainBandTargets[domain] ?? {};
    const domainSprTarget = design.domainSprTargets?.[domain] ?? 0;
    let sprStillNeeded = domainSprTarget;
    const domainPicked: Candidate[] = [];
    const skillTargets = design.domainSkillTargets?.[domain];
    const rotation: SkillRotation = {
      order: skillTargets ? buildQuotaRotationOrder(skillTargets) : rankSkillsByRarity(pool, domain),
      index: 0,
    };

    const bands = Object.keys(bandTargets)
      .map(Number)
      .sort((a, b) => a - b);
    if (design.strictSkillQuota && skillTargets) {
      const { picked, short } = pickStrictQuota(pool, domain, bandTargets, skillTargets, state);
      domainPicked.push(...picked);
      shortfalls.push(...short);
    }
    for (const band of design.strictSkillQuota && skillTargets ? [] : bands) {
      const target = bandTargets[band] ?? 0;
      if (target === 0) continue;
      // Prefer SPR for however many of this band's slots are still needed
      // to hit the domain's SPR sub-quota; the rest prefer MCQ.
      const sprHere = bandSprQuota ? Math.min(bandSprQuota[band] ?? 0, target) : Math.min(sprStillNeeded, target);
      const { picked, short } = pickForDomainBand(pool, domain, band, target, state, false, rotation);
      // Re-split: if we got fewer SPRs than desired among `picked`, try
      // swapping an MCQ pick for an available SPR of the same domain+band.
      let gotSpr = picked.filter((c) => c.type === "spr").length;
      for (let i = 0; i < picked.length && gotSpr < sprHere; i++) {
        if (picked[i]!.type === "spr") continue;
        const discarded = picked[i]!;
        // When this domain has explicit skill quotas, prefer a same-skill
        // SPR replacement first so the swap can't silently break the quota
        // by handing a different skill's SPR to a domain that's tracking
        // per-skill counts. Gated behind `skillTargets` so sat-practice-1
        // (which never sets domainSkillTargets) is byte-for-byte unaffected.
        const sprReplacement =
          (skillTargets &&
            pool.find(
              (c) =>
                c.domainCode === domain &&
                c.scoreBand === band &&
                c.type === "spr" &&
                c.skillCode === discarded.skillCode &&
                isAvailable(c, state),
            )) ||
          pool.find((c) => c.domainCode === domain && c.scoreBand === band && c.type === "spr" && isAvailable(c, state));
        if (sprReplacement) {
          // Un-claim the MCQ we're discarding, claim the SPR instead.
          state.used.delete(discarded.id);
          picked[i] = sprReplacement;
          claim(sprReplacement, state);
          gotSpr++;
        }
      }
      sprStillNeeded -= gotSpr;
      if (bandSprQuota) bandSprQuota[band] = Math.max(0, (bandSprQuota[band] ?? 0) - gotSpr);
      domainPicked.push(...picked);
      shortfalls.push(...short);
    }

    // Backfill any shortfall for this domain from the rest of the section,
    // targeting the domain's median requested band so the difficulty curve
    // stays roughly intact.
    let domainTotalTarget = 0;
    for (const count of Object.values(bandTargets)) domainTotalTarget += count ?? 0;
    if (domainPicked.length < domainTotalTarget) {
      const missing = domainTotalTarget - domainPicked.length;
      const medianBand = bands.length > 0 ? bands[Math.floor(bands.length / 2)]! : 4;
      const { picked, short } = backfillFromSection(pool, medianBand, missing, state);
      domainPicked.push(...picked);
      shortfalls.push(...short.map((s) => `${domain} backfill: ${s}`));
    }

    selectedByDomain.set(domain, domainPicked);
  }

  // Layout order:
  //  RW: domain order (fixed), then ascending scoreBand within domain.
  //  MATH: no domain grouping — ascending scoreBand across the whole
  //        module, with the domainSprTargets' SPR items placed at the
  //        proportional tail positions (~1/4, ~1/2, ~3/4, last — see
  //        src/exams/sat-practice-1.ts's header comment for the exact
  //        official reference pattern this approximates).
  const isMath = design.domainOrder[0] === "H" || design.domainOrder[0] === "P";
  let ordered: Candidate[];
  if (!isMath && design.skillOrder) {
    const all = design.domainOrder.flatMap((d) => selectedByDomain.get(d) ?? []);
    const grouped = design.skillOrder.flatMap((group) =>
      all.filter((c) => group.includes(c.skillCode)).sort((a, b) => a.scoreBand - b.scoreBand || a.id.localeCompare(b.id)),
    );
    const placed = new Set(grouped.map((c) => c.id));
    const leftovers = all.filter((c) => !placed.has(c.id));
    if (leftovers.length > 0) shortfalls.push(`layout: ${leftovers.length} pick(s) outside skillOrder appended at the end`);
    ordered = [...grouped, ...leftovers];
  } else if (!isMath) {
    ordered = design.domainOrder.flatMap((d) => (selectedByDomain.get(d) ?? []).sort((a, b) => a.scoreBand - b.scoreBand));
  } else {
    const all = design.domainOrder.flatMap((d) => selectedByDomain.get(d) ?? []);
    const mcq = all.filter((c) => c.type === "mcq").sort((a, b) => a.scoreBand - b.scoreBand);
    const spr = all.filter((c) => c.type === "spr").sort((a, b) => a.scoreBand - b.scoreBand);
    ordered =
      design.sprPositions && design.sprPositions.length === spr.length
        ? placeSprAtPositions(mcq, spr, design.count, design.sprPositions)
        : interleaveSprAtProportionalTail(mcq, spr, design.count);
  }

  return { ids: ordered.map((c) => c.id), candidates: ordered, shortfalls };
}

/**
 * Places `spr` items among `mcq` items at the proportional equivalent of
 * College Board's official linear-form SPR pattern (positions 6, 7, 13,
 * 14, 20, 21, 27 of a 27-question module — roughly 1/4, 1/2, 3/4, and the
 * final item, each as an adjacent pair except the last). For our
 * `total`-question module we space `spr.length` items similarly.
 */
function interleaveSprAtProportionalTail(mcq: Candidate[], spr: Candidate[], total: number): Candidate[] {
  const result: (Candidate | null)[] = new Array(total).fill(null);
  // Official pattern is pairs at ~1/4 and ~1/2, then remaining singly
  // toward ~3/4 and the last slot. Compute target positions (0-indexed)
  // proportionally to `total` and to how many SPR items we actually have.
  const fractions = [0.22, 0.26, 0.48, 0.52, 0.73, 0.77, 0.96].slice(0, spr.length);
  // If we have fewer than 7 SPR items, space the ones we have evenly
  // across the same span rather than reusing only the first N fractions
  // (which would cluster them all before the midpoint).
  const positions =
    spr.length <= fractions.length
      ? Array.from({ length: spr.length }, (_, i) => Math.round(((i + 1) / (spr.length + 1)) * (total - 1)))
      : fractions.map((f) => Math.round(f * (total - 1)));
  const usedPositions = new Set<number>();
  positions.forEach((pos, i) => {
    let p = pos;
    while (usedPositions.has(p) && p < total - 1) p++;
    usedPositions.add(p);
    result[p] = spr[i]!;
  });
  let mcqIndex = 0;
  for (let i = 0; i < total; i++) {
    if (result[i] === null) {
      result[i] = mcq[mcqIndex++] ?? null;
    }
  }
  return result.filter((c): c is Candidate => c !== null);
}

/** Places `spr` (ascending band) at exact 1-indexed `positions`, filling the rest with `mcq` (ascending band). */
function placeSprAtPositions(mcq: Candidate[], spr: Candidate[], total: number, positions: number[]): Candidate[] {
  const slots = new Set(positions.map((p) => p - 1));
  const sortedPositions = [...positions].sort((a, b) => a - b);
  const result: Candidate[] = [];
  let m = 0;
  for (let i = 0; i < total; i++) {
    const sprIndex = sortedPositions.indexOf(i + 1);
    if (slots.has(i) && sprIndex >= 0) result.push(spr[sprIndex]!);
    else if (mcq[m]) result.push(mcq[m++]!);
  }
  return result;
}

function printSummary(sectionCode: SectionCode, moduleName: ModuleName, result: ModuleResult): void {
  console.log(`\n-- ${sectionCode} ${moduleName} (${result.ids.length} questions) --`);
  const byDomainSkillBandType = new Map<string, number>();
  for (const c of result.candidates) {
    const key = `${c.domainCode}\t${c.skillCode}\tband ${c.scoreBand}\t${c.type}`;
    byDomainSkillBandType.set(key, (byDomainSkillBandType.get(key) ?? 0) + 1);
  }
  for (const [key, n] of [...byDomainSkillBandType.entries()].sort()) {
    console.log(`  ${key}\t${n}`);
  }
  const sprCount = result.candidates.filter((c) => c.type === "spr").length;
  if (sprCount > 0) console.log(`  (SPR count: ${sprCount})`);
  if (result.shortfalls.length > 0) {
    console.log(`  SHORT: ${result.shortfalls.join("; ")}`);
  }
}

async function runDesign(examId: string, seed: string): Promise<void> {
  // Every --exam value must have a corresponding entry in DESIGNS — an
  // unrecognized id throws here rather than silently falling back to
  // sat-practice-1's design (the same "don't paper over a typo" philosophy
  // as the domainBandTargets sum check above).
  const sections = DESIGNS[examId];
  if (!sections) {
    throw new Error(`No design in DESIGNS for --exam=${examId}. Known designs: ${Object.keys(DESIGNS).join(", ")}`);
  }

  // Redesigning an already-registered exam may freely reuse (or drop) that
  // exam's own current ids — only ids belonging to OTHER blueprints are
  // off-limits. Designing a brand-new --exam name (not yet registered)
  // excludes every currently-reserved id.
  const existing = getExam(examId);
  const ownIds = new Set(existing ? existing.sections.flatMap((s) => [...s.module1, ...s.module2Lower, ...s.module2Upper]) : []);
  // Re-designing a registered exam must keep reproducing its committed ids even
  // after LATER exams are registered. Those later exams may legitimately claim
  // ids that this exam also draws on (the SAT and PSAT banks share ~3,500
  // questions), and excluding them would silently shift this exam's picks. So
  // only exams that already existed when this one was designed are excluded:
  // same-assessment exams (any position) plus exams registered earlier. A
  // brand-new exam excludes everything reserved.
  let excludeIds: string[];
  if (existing) {
    const myIndex = EXAMS.indexOf(existing);
    const blocking = EXAMS.filter((e, i) => e !== existing && (e.assessment === existing.assessment || i < myIndex));
    const blockingIds = new Set(blocking.flatMap((e) => e.sections.flatMap((sec) => [...sec.module1, ...sec.module2Lower, ...sec.module2Upper])));
    excludeIds = [...blockingIds];
  } else {
    excludeIds = RESERVED_QUESTION_IDS.filter((id) => !ownIds.has(id));
  }
  console.log(
    existing
      ? `Redesigning already-registered exam "${examId}" — its own ${ownIds.size} ids stay eligible; ${excludeIds.length} ids from other exams are excluded.`
      : `Designing new exam "${examId}" — ${excludeIds.length} ids already reserved by other exams are excluded.`,
  );

  const state: SelectionState = { used: new Set(), claimedClusters: new Set() };
  const output: Record<SectionCode, Record<ModuleName, string[]>> = {
    RW: { module1: [], module2Lower: [], module2Upper: [] },
    MATH: { module1: [], module2Lower: [], module2Upper: [] },
  };

  for (const sectionCode of ["RW", "MATH"] as const) {
    const pool = await fetchCandidates(sectionCode, seed, excludeIds, assessmentFor(examId));
    console.log(`\n=== ${sectionCode}: ${pool.length} eligible candidates ===`);
    for (const moduleName of ["module1", "module2Lower", "module2Upper"] as const) {
      const design = sections[sectionCode][moduleName];
      const result = selectModule(pool, design, state);
      output[sectionCode][moduleName] = result.ids;
      printSummary(sectionCode, moduleName, result);
      if (result.ids.length !== design.count) {
        console.log(`  !! only ${result.ids.length}/${design.count} filled — bank may be too thin for this design.`);
      }
    }
  }

  console.log("\n\n=== Paste-ready TS (module id lists) ===\n");
  for (const sectionCode of ["RW", "MATH"] as const) {
    console.log(`// ${sectionCode}`);
    for (const moduleName of ["module1", "module2Lower", "module2Upper"] as const) {
      const ids = output[sectionCode][moduleName];
      console.log(`const ${sectionCode}_${moduleName} = [`);
      for (const id of ids) console.log(`  "${id}",`);
      console.log(`] as const; // length ${ids.length}`);
    }
  }
}

async function runVerify(): Promise<void> {
  const exams = EXAMS;
  let failures = 0;
  const check = (label: string, ok: boolean, detail?: string) => {
    console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
  };

  for (const bp of exams) {
    console.log(`\n=== Verifying ${bp.id} ===`);
    const structural = validateBlueprint(bp);
    check("structural invariants (spec.ts)", structural.length === 0, structural.map((i) => `${i.path}: ${i.message}`).join("; "));

    const allIds = bp.sections.flatMap((s) => [...s.module1, ...s.module2Lower, ...s.module2Upper]);
    // No id shared with another registered blueprint.
    for (const other of exams) {
      if (other.id === bp.id) continue;
      const otherIds = new Set(other.sections.flatMap((s) => [...s.module1, ...s.module2Lower, ...s.module2Upper]));
      const overlap = allIds.filter((id) => otherIds.has(id));
      check(`no id shared with ${other.id}`, overlap.length === 0, overlap.slice(0, 5).join(", "));
    }

    for (const section of bp.sections) {
      for (const [moduleName, ids] of [
        ["module1", section.module1],
        ["module2Lower", section.module2Lower],
        ["module2Upper", section.module2Upper],
      ] as const) {
        const rows = await db.orm.public.Question.where((q) => q.id.in([...ids])).all();
        const byId = new Map(rows.map((r) => [r.id, r]));
        check(`${section.sectionCode}.${moduleName}: all ids exist`, rows.length === ids.length, `found ${rows.length}/${ids.length}`);
        for (const id of ids) {
          const row = byId.get(id);
          if (!row) continue;
          check(`${id}: gradable`, row.correctAnswer.length > 0);
          check(`${id}: has rationale`, !!row.rationale);
          check(`${id}: no embedded math images`, !row.hasEmbeddedMathImages);
        }
        const placements = await db.orm.public.QuestionAssessment
          .where((qa) => qa.questionId.in([...ids]))
          .where({ assessment: bp.assessment })
          .all();
        const wrongSection = placements.filter((p) => p.sectionCode !== section.sectionCode);
        check(`${section.sectionCode}.${moduleName}: all placements match section`, wrongSection.length === 0);
      }
    }

    // No two ids in the whole exam share a non-null templateClusterId/parentTemplateId.
    const rows = await db.orm.public.Question.where((q) => q.id.in([...allIds])).all();
    const clusterMap = new Map<string, string[]>();
    for (const r of rows) {
      for (const key of [r.templateClusterId, r.parentTemplateId]) {
        if (!key) continue;
        clusterMap.set(key, [...(clusterMap.get(key) ?? []), r.id]);
      }
    }
    const collisions = [...clusterMap.entries()].filter(([, ids]) => ids.length > 1);
    check("no shared templateClusterId/parentTemplateId across the exam", collisions.length === 0, JSON.stringify(collisions.slice(0, 3)));
  }

  console.log(`\n${failures === 0 ? "All blueprint invariants passed." : `${failures} invariant(s) FAILED.`}`);
  if (failures > 0) process.exit(1);
}

async function main(): Promise<void> {
  const { exam, seed, verify } = parseArgs(process.argv.slice(2));
  if (verify) {
    await runVerify();
  } else {
    await runDesign(exam, seed);
  }
  await db.close();
}

main().catch(async (err: unknown) => {
  console.error(err);
  await db.close();
  process.exit(1);
});
