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
// The domain/band/SPR targets below are a reasoned design, not a script
// parameter — see CLAUDE.md and the exam plan for how each number traces
// back to College Board's published Assessment Framework shares. They are
// written out explicitly (not derived by proportional rounding) so the
// selection is exactly reproducible and easy to eyeball.

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

const SECTIONS: Record<SectionCode, Record<ModuleName, ModuleDesign>> = {
  RW: { module1: RW_MODULE_1, module2Lower: RW_MODULE_2_LOWER, module2Upper: RW_MODULE_2_UPPER },
  MATH: { module1: MATH_MODULE_1, module2Lower: MATH_MODULE_2_LOWER, module2Upper: MATH_MODULE_2_UPPER },
};

// Sanity-check the hand-authored designs at load time — a typo here would
// otherwise silently produce a module short of its contractual count.
for (const [sectionCode, modules] of Object.entries(SECTIONS)) {
  for (const [moduleName, design] of Object.entries(modules)) {
    const sum = sumTargets(design.domainBandTargets);
    if (sum !== design.count) {
      throw new Error(`${sectionCode}.${moduleName}: domainBandTargets sums to ${sum}, expected ${design.count}`);
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

async function fetchCandidates(sectionCode: SectionCode, seed: string, excludeIds: readonly string[]): Promise<Candidate[]> {
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
        q."parentTemplateId"
      FROM question q
      JOIN question_assessment qa ON qa."questionId" = q.id
      WHERE qa.assessment = 'SAT'
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
    } as const)
    .build();
  const rows = await db.runtime().query(plan);
  return rows.map((r) => ({
    id: r.id,
    type: r.type as "mcq" | "spr",
    domainCode: r.domainCode,
    skillCode: r.skillCode,
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

interface SkillRotation {
  order: string[];
  index: number;
}

interface PickResult {
  picked: Candidate[];
  short: string[];
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

function selectModule(pool: Candidate[], design: ModuleDesign, state: SelectionState): ModuleResult {
  const shortfalls: string[] = [];
  const selectedByDomain = new Map<string, Candidate[]>();

  for (const domain of design.domainOrder) {
    const bandTargets = design.domainBandTargets[domain] ?? {};
    const domainSprTarget = design.domainSprTargets?.[domain] ?? 0;
    let sprStillNeeded = domainSprTarget;
    const domainPicked: Candidate[] = [];
    const rotation: SkillRotation = { order: rankSkillsByRarity(pool, domain), index: 0 };

    const bands = Object.keys(bandTargets)
      .map(Number)
      .sort((a, b) => a - b);
    for (const band of bands) {
      const target = bandTargets[band] ?? 0;
      if (target === 0) continue;
      // Prefer SPR for however many of this band's slots are still needed
      // to hit the domain's SPR sub-quota; the rest prefer MCQ.
      const sprHere = Math.min(sprStillNeeded, target);
      const { picked, short } = pickForDomainBand(pool, domain, band, target, state, false, rotation);
      // Re-split: if we got fewer SPRs than desired among `picked`, try
      // swapping an MCQ pick for an available SPR of the same domain+band.
      let gotSpr = picked.filter((c) => c.type === "spr").length;
      for (let i = 0; i < picked.length && gotSpr < sprHere; i++) {
        if (picked[i]!.type === "spr") continue;
        const sprReplacement = pool.find(
          (c) => c.domainCode === domain && c.scoreBand === band && c.type === "spr" && isAvailable(c, state),
        );
        if (sprReplacement) {
          // Un-claim the MCQ we're discarding, claim the SPR instead.
          const discarded = picked[i]!;
          state.used.delete(discarded.id);
          picked[i] = sprReplacement;
          claim(sprReplacement, state);
          gotSpr++;
        }
      }
      sprStillNeeded -= gotSpr;
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
  if (!isMath) {
    ordered = design.domainOrder.flatMap((d) => (selectedByDomain.get(d) ?? []).sort((a, b) => a.scoreBand - b.scoreBand));
  } else {
    const all = design.domainOrder.flatMap((d) => selectedByDomain.get(d) ?? []);
    const mcq = all.filter((c) => c.type === "mcq").sort((a, b) => a.scoreBand - b.scoreBand);
    const spr = all.filter((c) => c.type === "spr").sort((a, b) => a.scoreBand - b.scoreBand);
    ordered = interleaveSprAtProportionalTail(mcq, spr, design.count);
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
  // Redesigning an already-registered exam may freely reuse (or drop) that
  // exam's own current ids — only ids belonging to OTHER blueprints are
  // off-limits. Designing a brand-new --exam name (not yet registered)
  // excludes every currently-reserved id.
  const existing = getExam(examId);
  const ownIds = new Set(existing ? existing.sections.flatMap((s) => [...s.module1, ...s.module2Lower, ...s.module2Upper]) : []);
  const excludeIds = RESERVED_QUESTION_IDS.filter((id) => !ownIds.has(id));
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
    const pool = await fetchCandidates(sectionCode, seed, excludeIds);
    console.log(`\n=== ${sectionCode}: ${pool.length} eligible candidates ===`);
    for (const moduleName of ["module1", "module2Lower", "module2Upper"] as const) {
      const design = SECTIONS[sectionCode][moduleName];
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
          .where({ assessment: "SAT" })
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
