// One-time (re-runnable) pass: resolve every unique equation image in the
// disclosed/IBN corpus to LaTeX and cache the result to disk. DISK ONLY —
// no network, no AI API calls. See scripts/lib/equation-cache.ts for the
// two code-only resolution methods (PNG-embedded MathML, the spoken-math
// grammar parser) and scripts/lib/manual-overrides for what's left after.
//
// Usage: tsx scripts/convert-math.ts

import { buildEquationCache, NEEDS_REVIEW_DIR } from "./lib/equation-cache";

async function main(): Promise<void> {
  const summary = await buildEquationCache();
  console.log("== Equation image resolution ==");
  console.log(`  total unique equation images: ${summary.total}`);
  console.log(`  resolved via embedded PNG MathML: ${summary.resolved["png-mathml"]}`);
  console.log(`  resolved via spoken-math alt-text parse: ${summary.resolved["spoken-math-alt-text"]}`);
  console.log(`  resolved via manual override: ${summary.resolved.manual}`);
  console.log(`  unresolved (written to ${NEEDS_REVIEW_DIR}/): ${summary.unresolved}`);
  if (summary.unresolved > 0) {
    console.log(
      `  review the PNGs there, then add {"<hash>": "<latex>"} entries to data/raw/vision/manual-overrides.json and re-run.`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
