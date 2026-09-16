// Scrape the College Board educator Question Bank (SAT + PSAT/NMSQT & PSAT
// 10) to disk. NETWORK ONLY — this file must never import src/prisma/db.
//
// Phase A: 4 list requests (2 assessments x 2 sections) -> data/raw/list/.
// Phase B: one detail fetch per unique question -> data/raw/question/ or
//          data/raw/ibn/, resumable by skipping files already on disk.
//
// Usage: tsx scripts/scrape.ts [--phase=a|b|all] [--force] [--concurrency=N] [--only=<id>]

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";

import {
  ASSESSMENTS,
  FAILURES_FILE,
  IBN_DIR,
  LIST_DIR,
  QUARANTINE_DIR,
  QUESTION_DIR,
  QBANK,
  SAIC,
  SECTIONS,
  fetchJson,
  pool,
  writeJsonAtomic,
  type ListRow,
} from "./lib/qbank";

interface Args {
  phase: "a" | "b" | "all";
  force: boolean;
  concurrency: number;
  only: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { phase: "all", force: false, concurrency: 5, only: null };
  for (const arg of argv) {
    if (arg === "--force") args.force = true;
    else if (arg.startsWith("--phase=")) {
      const v = arg.slice("--phase=".length);
      if (v === "a" || v === "b" || v === "all") args.phase = v;
    } else if (arg.startsWith("--concurrency=")) {
      args.concurrency = Number(arg.slice("--concurrency=".length));
    } else if (arg.startsWith("--only=")) {
      args.only = arg.slice("--only=".length);
    }
  }
  return args;
}

function listPath(assessmentKey: string, test: number): string {
  return `${LIST_DIR}/${assessmentKey}-${test}.json`;
}

function isListRowArray(value: unknown): value is ListRow[] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) =>
        typeof row === "object" &&
        row !== null &&
        "questionId" in row &&
        "primary_class_cd" in row,
    )
  );
}

async function phaseA(): Promise<void> {
  console.log("== Phase A: list endpoints ==");
  for (const assessment of ASSESSMENTS) {
    for (const section of SECTIONS) {
      const label = `${assessment.key} test=${section.test} domain=${section.domains}`;
      const body = JSON.stringify({
        asmtEventId: assessment.asmtEventId,
        test: section.test,
        domain: section.domains,
      });
      const data = await fetchJson(
        `${QBANK}/get-questions`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body },
        label,
      );
      if (!isListRowArray(data) || data.length === 0) {
        throw new Error(`unexpected/empty list response for ${label}`);
      }
      await writeJsonAtomic(listPath(assessment.key, section.test), data);
      console.log(`  ${label}: ${data.length} rows`);
    }
  }
}

interface UniqueKeys {
  externalIds: Set<string>;
  ibns: Set<string>;
}

async function collectUniqueKeys(): Promise<UniqueKeys> {
  const externalIds = new Set<string>();
  const ibns = new Set<string>();
  for (const assessment of ASSESSMENTS) {
    for (const section of SECTIONS) {
      const path = listPath(assessment.key, section.test);
      const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (!isListRowArray(raw)) throw new Error(`corrupt list file: ${path}`);
      for (const row of raw) {
        const hasExternal = row.external_id !== null && row.external_id !== "";
        const hasIbn = row.ibn !== null && row.ibn !== "";
        if (hasExternal === hasIbn) {
          throw new Error(
            `row violates external_id XOR ibn invariant: ${JSON.stringify(row)}`,
          );
        }
        if (hasExternal) externalIds.add(row.external_id as string);
        else ibns.add(row.ibn as string);
      }
    }
  }
  return { externalIds, ibns };
}

async function phaseB(args: Args): Promise<void> {
  console.log("== Phase B: per-item detail ==");
  await mkdir(QUARANTINE_DIR, { recursive: true });

  const { externalIds, ibns } = await collectUniqueKeys();
  console.log(`  unique external_id: ${externalIds.size}, unique ibn: ${ibns.size}`);

  let externalList = Array.from(externalIds);
  let ibnList = Array.from(ibns);
  if (args.only) {
    externalList = externalList.filter((id) => id === args.only);
    ibnList = ibnList.filter((id) => id === args.only);
  }

  const failures: { id: string; kind: "question" | "ibn"; error: string }[] = [];
  let done = 0;
  const total = externalList.length + ibnList.length;

  function progress(): void {
    done++;
    if (done % 100 === 0 || done === total) {
      console.log(`  progress: ${done}/${total}`);
    }
  }

  await pool(externalList, args.concurrency, async (externalId) => {
    const path = `${QUESTION_DIR}/${externalId}.json`;
    if (!args.force && existsSync(path)) {
      progress();
      return;
    }
    try {
      const data = await fetchJson(
        `${QBANK}/get-question`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ external_id: externalId }),
        },
        `question ${externalId}`,
      );
      await writeJsonAtomic(path, data);
    } catch (err) {
      failures.push({ id: externalId, kind: "question", error: String(err) });
    }
    progress();
  });

  await pool(ibnList, args.concurrency, async (ibn) => {
    const path = `${IBN_DIR}/${ibn}.json`;
    if (!args.force && existsSync(path)) {
      progress();
      return;
    }
    try {
      const data = await fetchJson(`${SAIC}/${ibn}.json`, { method: "GET" }, `ibn ${ibn}`);
      await writeJsonAtomic(path, data);
    } catch (err) {
      failures.push({ id: ibn, kind: "ibn", error: String(err) });
    }
    progress();
  });

  if (failures.length > 0) {
    await writeJsonAtomic(FAILURES_FILE, failures);
    console.error(`  ${failures.length} failures written to ${FAILURES_FILE}`);
    console.error("  re-run `pnpm scrape:detail` to retry the missing set.");
    process.exitCode = 1;
  } else {
    console.log("  all detail fetched successfully.");
  }

  const questionCount = (await readdir(QUESTION_DIR).catch(() => [])).length;
  const ibnCount = (await readdir(IBN_DIR).catch(() => [])).length;
  console.log(`  on disk: question=${questionCount} ibn=${ibnCount}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(LIST_DIR, { recursive: true });
  await mkdir(QUESTION_DIR, { recursive: true });
  await mkdir(IBN_DIR, { recursive: true });

  if (args.phase === "a" || args.phase === "all") await phaseA();
  if (args.phase === "b" || args.phase === "all") await phaseB(args);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
