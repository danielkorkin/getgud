// Dev-only PSAT smoke-test blueprint — the PSAT twin of sat-smoke.ts: 3
// questions and a 1-minute timer per module, 1-minute break. Its point is to
// exercise the whole state machine AND the PSAT-specific surfaces (160-760
// section labels, the 1520 total, the NMSC Selection Index) in a couple of
// minutes. Filtered out of `/tests` in production (see `devOnly`).
//
// Ids are drawn from the PSAT/NMSQT & PSAT 10 bank, disjoint from every other
// registered blueprint's ids (asserted at module load in index.ts).

import type { ExamBlueprint } from "./spec";

const RW_MODULE_1 = ["2b0ec1b9-82bf-48d1-9817-b1fc4aaab9b6", "b8087e41-58a8-47b7-8929-ef5d9f082f0d", "7d889d5e-6ff0-4c2b-a1b2-9b0d56817fea"] as const;
const RW_MODULE_2_LOWER = ["e9f142be-2f7c-44eb-a99a-aa5eb0e586ac", "a7dc218f-7af4-4a81-8a3e-dc36da41b8e2", "20bd7e10-d0b5-4923-930e-f3c22dff2c07"] as const;
const RW_MODULE_2_UPPER = ["ea1a64cf-daf1-4d0e-8070-3f1ad98f30d3", "344d2279-223b-4e5e-89b6-609e08488125", "cbd580d7-1b7a-452d-8eb4-06f8db889ec7"] as const;

const MATH_MODULE_1 = ["7e480092-1ead-484d-8b6f-5c6417fa9d9f", "1549b7a3-5fbf-46f8-8861-103e5d9edae0", "d739e9dd-c317-4c86-831a-07375a627a3d"] as const;
const MATH_MODULE_2_LOWER = ["020349-DC", "b80105ad-11a3-443a-9dc8-51472ba42bbf", "22bb3d70-ebff-46aa-8f1d-07a231d876e8"] as const;
const MATH_MODULE_2_UPPER = ["f8a92cc0-95bf-4c16-8e6e-b31fa01f8b52", "374a0f38-19f3-4644-8e99-cb97adaa27f3", "e8f7d348-9106-4f42-a41c-8400c1758a07"] as const;

// raw 0..6 -> scaled, a simple linear ramp over 160-760 (not derived from any
// official table — this blueprint exercises the state machine, not scoring
// fidelity). Lower variant clamps at 460 to exercise the cap behavior.
const SCALED_UPPER = [160, 260, 360, 460, 560, 660, 760] as const;
const SCALED_LOWER = [160, 260, 360, 460, 460, 460, 460] as const;

const NO_DOMAIN_SPEC = {
  count: 3,
  domainOrder: ["_"],
  domainCounts: { _: 3 },
  bandCurve: { 4: 3 },
  sprCount: 0,
};

export const PSAT_SMOKE: ExamBlueprint = {
  id: "psat-smoke",
  name: "PSAT Smoke Test (dev only)",
  assessment: "PSAT/NMSQT & PSAT 10",
  scale: { sectionMin: 160, sectionMax: 760 },
  devOnly: true,
  breakMinutes: 1,
  sections: [
    {
      sectionCode: "RW",
      minutesPerModule: 1,
      routingThreshold: 2,
      module1: RW_MODULE_1,
      module2Lower: RW_MODULE_2_LOWER,
      module2Upper: RW_MODULE_2_UPPER,
      scaled: { lower: SCALED_LOWER, upper: SCALED_UPPER },
      spec: { module1: NO_DOMAIN_SPEC, module2Lower: NO_DOMAIN_SPEC, module2Upper: NO_DOMAIN_SPEC },
    },
    {
      sectionCode: "MATH",
      minutesPerModule: 1,
      routingThreshold: 2,
      module1: MATH_MODULE_1,
      module2Lower: MATH_MODULE_2_LOWER,
      module2Upper: MATH_MODULE_2_UPPER,
      scaled: { lower: SCALED_LOWER, upper: SCALED_UPPER },
      spec: { module1: NO_DOMAIN_SPEC, module2Lower: NO_DOMAIN_SPEC, module2Upper: NO_DOMAIN_SPEC },
    },
  ],
};
