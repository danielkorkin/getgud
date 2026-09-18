// Registry for the Learn section. Deliberately dependency-free (no
// `server-only`, no `@/prisma/db`) — see spec.ts's header comment.
//
// Same shape, and the same reasoning, as src/exams/index.ts: everything is
// validated at module load and a bad entry throws immediately rather than
// degrading into a blank section somewhere in the UI. Don't work around a
// throw from here by relaxing the check — the checks exist because the
// failure modes they catch are all silent ones:
//
//   - A skill code typo would simply never match, so the results page would
//     show "no resources" for the skill a student is weakest at.
//   - A duplicate id would make one of the two entries unreachable at
//     /learn/guides/<id>, picked arbitrarily by lookup order.
//   - A `related` id pointing at a renamed resource would render a dead
//     "further reading" entry.
//
// All three are invisible in review and obvious at boot, which is the
// trade this module makes.

import { validateGuide, validateResource, type Guide, type Resource } from "./spec";
import { OFFICIAL_RESOURCES } from "./official";
import { COURSE_RESOURCES } from "./courses";
import { CHANNEL_RESOURCES } from "./channels";
import { LIBRARY_RESOURCES } from "./library";
import { MATH_REFERENCE } from "./guides/math-reference";
import { GRAMMAR_RULES } from "./guides/grammar-rules";
import { DESMOS_PLAYBOOK } from "./guides/desmos-playbook";
import { READING_STRATEGY } from "./guides/reading-strategy";
import { TRANSITIONS_AND_SYNTHESIS } from "./guides/transitions-and-synthesis";
import { ADAPTIVE_AND_PACING } from "./guides/adaptive-and-pacing";
import { DATA_AND_STATISTICS } from "./guides/data-and-statistics";
import { STUDY_PLAN } from "./guides/study-plan";

const ALL_RESOURCES: readonly Resource[] = [
  ...OFFICIAL_RESOURCES,
  ...COURSE_RESOURCES,
  ...CHANNEL_RESOURCES,
  ...LIBRARY_RESOURCES,
];

// Ordered for reading, not alphabetically: the two whole-test guides come
// first because they apply to everyone, then section-specific ones.
const ALL_GUIDES: readonly Guide[] = [
  ADAPTIVE_AND_PACING,
  STUDY_PLAN,
  GRAMMAR_RULES,
  READING_STRATEGY,
  TRANSITIONS_AND_SYNTHESIS,
  MATH_REFERENCE,
  DESMOS_PLAYBOOK,
  DATA_AND_STATISTICS,
];

function assertRegistryInvariants(resources: readonly Resource[], guides: readonly Guide[]): void {
  const issues: string[] = [];

  for (const r of resources) {
    for (const issue of validateResource(r)) issues.push(`${issue.path}: ${issue.message}`);
  }
  for (const g of guides) {
    for (const issue of validateGuide(g)) issues.push(`${issue.path}: ${issue.message}`);
  }

  // Ids share one namespace across resources and guides. They don't have to
  // — they're looked up separately — but a shared namespace means an
  // anchor or a `related` reference can never be ambiguous about which kind
  // of thing it points at.
  const seen = new Map<string, string>();
  for (const entry of [...resources.map((r) => ["resource", r.id] as const), ...guides.map((g) => ["guide", g.id] as const)]) {
    const [kind, id] = entry;
    const prior = seen.get(id);
    if (prior) issues.push(`duplicate id "${id}" (${prior} and ${kind})`);
    seen.set(id, kind);
  }

  // Two resources pointing at the same URL is nearly always an accident
  // during curation — the same link added under two ids from two different
  // data files.
  const urlOwner = new Map<string, string>();
  for (const r of resources) {
    const owner = urlOwner.get(r.url);
    if (owner) issues.push(`duplicate URL shared by "${owner}" and "${r.id}": ${r.url}`);
    urlOwner.set(r.url, r.id);
  }

  const resourceIds = new Set(resources.map((r) => r.id));
  for (const g of guides) {
    for (const id of g.related ?? []) {
      if (!resourceIds.has(id)) issues.push(`guide[${g.id}].related references unknown resource id: ${id}`);
    }
  }

  if (issues.length > 0) {
    throw new Error(`Learn registry failed validation:\n  - ${issues.join("\n  - ")}`);
  }
}

assertRegistryInvariants(ALL_RESOURCES, ALL_GUIDES);

export const RESOURCES: readonly Resource[] = ALL_RESOURCES;
export const GUIDES: readonly Guide[] = ALL_GUIDES;

export function getResource(id: string): Resource | null {
  return ALL_RESOURCES.find((r) => r.id === id) ?? null;
}

export function getGuide(id: string): Guide | null {
  return ALL_GUIDES.find((g) => g.id === id) ?? null;
}

export const FEATURED_RESOURCES: readonly Resource[] = ALL_RESOURCES.filter((r) => r.featured);
export const FEATURED_GUIDES: readonly Guide[] = ALL_GUIDES.filter((g) => g.featured);

/**
 * Everything tagged to one skill code, most specific first: a resource or
 * guide naming the skill outright ranks above one that only names its
 * domain. This is what the results page uses to answer "I got Transitions
 * wrong — now what", so specificity is the whole point of the ordering.
 */
export function studyForSkill(skillCode: string, domainCode: string): { guides: Guide[]; resources: Resource[] } {
  const guides = [
    ...ALL_GUIDES.filter((g) => g.skillCodes?.includes(skillCode)),
    ...ALL_GUIDES.filter((g) => !g.skillCodes?.includes(skillCode) && g.domainCodes?.includes(domainCode)),
  ];
  const resources = [
    ...ALL_RESOURCES.filter((r) => r.skillCodes?.includes(skillCode)),
    ...ALL_RESOURCES.filter((r) => !r.skillCodes?.includes(skillCode) && r.domainCodes?.includes(domainCode)),
  ];
  return { guides, resources };
}

/** Guides and resources tagged to a domain, for the /learn/topics/[domain] pages. */
export function studyForDomain(domainCode: string): { guides: Guide[]; resources: Resource[] } {
  return {
    guides: ALL_GUIDES.filter((g) => g.domainCodes?.includes(domainCode)),
    resources: ALL_RESOURCES.filter((r) => r.domainCodes?.includes(domainCode)),
  };
}

/**
 * Resources that apply to the whole test rather than to any one domain —
 * registration, study planning, official practice. These would otherwise
 * never surface on a domain page, since they carry no domain codes at all.
 */
export const GENERAL_RESOURCES: readonly Resource[] = ALL_RESOURCES.filter(
  (r) => !r.domainCodes?.length && !r.skillCodes?.length && !r.sectionCodes?.length,
);

export type { Resource, Guide, GuideBlock, GuideSection, ResourceKind, ResourceCost, TestTarget, GuideKind } from "./spec";
