// Dev-only smoke-test blueprint: 3 questions and a 1-minute timer per
// module, 1-minute break. Exists purely so the whole state machine
// (directions -> active -> submit -> route -> break -> ... -> completed,
// plus reload-mid-module, tab-closed expiry, and tab-open expiry) can be
// exercised end-to-end in a couple of minutes instead of sitting through
// the real test's 2h14m. Filtered out of `/tests` in production — see
// `devOnly` below and its use in src/exams/index.ts.
//
// Ids are drawn from the SAT bank, disjoint from every other registered
// blueprint's ids (asserted at module load in index.ts).

import type { ExamBlueprint } from "./spec";

const RW_MODULE_1 = ["002fb221-07c6-4406-a00c-ed57339ea78c", "006d3b30-cede-4889-82fd-dbf2335054f4", "007dd895-e4ed-4aa1-8414-06c33e6fd271"] as const;
const RW_MODULE_2_LOWER = ["00e094ed-abe1-4142-af30-ed57eb2e7a2d", "014a9604-e171-4d08-bf30-8e902eb9d335", "01d852b8-1a06-4514-b580-1127a9d57e47"] as const;
const RW_MODULE_2_UPPER = ["01e38e21-9fcc-47d0-befd-d547fc90bc9c", "01e4ee04-31c9-44d9-be3a-ab16ed00a0c1", "020f2cdc-bab1-476b-849b-762e11ace6c1"] as const;

const MATH_MODULE_1 = ["00094-DC", "00113-DC", "00142-DC"] as const;
const MATH_MODULE_2_LOWER = ["00184-DC", "00489-DC", "00538-DC"] as const;
const MATH_MODULE_2_UPPER = ["00566-DC", "00664-DC", "009bb623-417f-401a-bef5-57d78eeaaf99"] as const;

// raw 0..6 -> scaled, a simple linear ramp (not derived from any official
// table — this blueprint is for exercising the state machine, not scoring
// fidelity). Lower variant clamps at 500 to exercise the cap behavior.
const SCALED_UPPER = [200, 300, 400, 500, 600, 700, 800] as const;
const SCALED_LOWER = [200, 300, 400, 500, 500, 500, 500] as const;

const NO_DOMAIN_SPEC = {
  count: 3,
  domainOrder: ["_"],
  domainCounts: { _: 3 },
  bandCurve: { 4: 3 },
  sprCount: 0,
};

export const SAT_SMOKE: ExamBlueprint = {
  id: "sat-smoke",
  name: "SAT Smoke Test (dev only)",
  assessment: "SAT",
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
