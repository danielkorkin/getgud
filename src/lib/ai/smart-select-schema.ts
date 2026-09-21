// Server-only. Structured-output schema for "Smart select"
// (src/actions/sets.ts's smartSelect / src/lib/query/smart-select.ts).
//
// Every field is required — no z.default(), no .optional() anywhere in this
// tree. Some models routed through OpenRouter run behind a strict
// JSON-schema backend that rejects a schema where a property is missing
// from its object's `required` array, which is exactly what a zod
// `.default(...)` produces (see stats-schema.ts for the incident this was
// first found from — the fix there is the same: model "nothing to report"
// as an empty array/string, never an omitted key).
//
// A factory rather than a fixed schema because the valid `index` range
// depends on how many candidates were actually sent — constraining it here
// (rather than trusting the model to stay in range, or validating question
// ids as free strings) makes a hallucinated reference structurally
// impossible, the same trick stats-schema.ts uses by enum-constraining
// skill codes to the catalog.
import "server-only";
import { z } from "zod";

export function smartSelectionSchema(candidateCount: number) {
  return z.object({
    picks: z
      .array(
        z.object({
          // 1-based index into the candidate list the prompt was given.
          index: z.number().int().min(1).max(Math.max(1, candidateCount)),
          reason: z.string().min(1).max(160),
        }),
      )
      .max(50),
    // "" when there's nothing to flag — an empty string, never an omitted key.
    note: z.string().max(240),
  });
}

export type SmartSelectionResult = z.infer<ReturnType<typeof smartSelectionSchema>>;
