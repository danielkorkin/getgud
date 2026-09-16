// Load scraped College Board question bank data from disk into Postgres.
// DISK ONLY on the read side — this file must never issue a network request.
//
// Usage: tsx scripts/load.ts [--mode=reload|upsert] [--dry-run] [--limit=N]
//
// --mode=reload (default): TRUNCATE both tables, then insert everything.
// --mode=upsert: insert-or-update by primary key, nothing removed.

import { readFile } from "node:fs/promises";

import {
  ASSESSMENTS,
  IBN_DIR,
  LIST_DIR,
  QUESTION_DIR,
  QUARANTINE_DIR,
  SECTIONS,
  chunk,
  writeJsonAtomic,
  type ListRow,
} from "./lib/qbank";
import {
  QuarantineError,
  buildSkillDescMap,
  normalizeIbn,
  normalizePlacement,
  normalizeQbank,
  questionKeyOf,
  type ListEntry,
  type NormalizedPlacement,
  type NormalizedQuestion,
} from "./lib/normalize";
import { loadEquationCache } from "./lib/equation-cache";

interface Args {
  mode: "reload" | "upsert";
  dryRun: boolean;
  limit: number | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { mode: "reload", dryRun: false, limit: null };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--mode=")) {
      const v = arg.slice("--mode=".length);
      if (v === "reload" || v === "upsert") args.mode = v;
    } else if (arg.startsWith("--limit=")) {
      args.limit = Number(arg.slice("--limit=".length));
    }
  }
  return args;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function isListRowArray(value: unknown): value is ListRow[] {
  return Array.isArray(value);
}

async function loadListEntries(): Promise<ListEntry[]> {
  const entries: ListEntry[] = [];
  for (const assessment of ASSESSMENTS) {
    for (const section of SECTIONS) {
      const path = `${LIST_DIR}/${assessment.key}-${section.test}.json`;
      const raw = await readJson(path);
      if (!isListRowArray(raw)) throw new Error(`corrupt list file: ${path}`);
      for (const row of raw) {
        entries.push({
          row,
          assessmentKey: assessment.key,
          assessmentLabel: assessment.label,
          asmtEventId: assessment.asmtEventId,
          program: assessment.program,
          section: section.test,
          sectionCode: section.code,
        });
      }
    }
  }
  return entries;
}

interface BuildResult {
  questions: NormalizedQuestion[];
  placements: NormalizedPlacement[];
  quarantined: { key: string; reason: string }[];
  duplicatePlacementsDropped: number;
}

async function buildRows(entries: ListEntry[], limit: number | null): Promise<BuildResult> {
  const skillDescMap = buildSkillDescMap(entries);
  const equationCache = await loadEquationCache();
  const latexLookup = new Map<string, string>();
  for (const [hash, resolution] of equationCache) {
    if (resolution.status === "resolved") latexLookup.set(hash, resolution.latex);
  }

  // Unique question keys, preserving first-seen assessment/kind for lookup.
  const uniqueKeys = new Map<string, "external" | "ibn">();
  for (const { row } of entries) {
    const key = questionKeyOf(row);
    uniqueKeys.set(key, row.external_id ? "external" : "ibn");
  }

  let keys = [...uniqueKeys.entries()];
  if (limit !== null) keys = keys.slice(0, limit);
  const keySet = new Set(keys.map(([k]) => k));

  const questions: NormalizedQuestion[] = [];
  const quarantined: { key: string; reason: string }[] = [];

  for (const [key, kind] of keys) {
    try {
      if (kind === "external") {
        const raw = await readJson(`${QUESTION_DIR}/${key}.json`);
        questions.push(normalizeQbank(raw, key));
      } else {
        const raw = await readJson(`${IBN_DIR}/${key}.json`);
        questions.push(normalizeIbn(raw, key, latexLookup));
      }
    } catch (err) {
      const reason = err instanceof QuarantineError ? err.message : String(err);
      quarantined.push({ key, reason });
      keySet.delete(key);
    }
  }

  const placements: NormalizedPlacement[] = [];
  const seenPlacementKeys = new Set<string>();
  let duplicatePlacementsDropped = 0;

  for (const entry of entries) {
    const key = questionKeyOf(entry.row);
    if (!keySet.has(key)) continue; // quarantined or excluded by --limit
    const placementKey = `${entry.assessmentLabel}|${key}`;
    if (seenPlacementKeys.has(placementKey)) {
      duplicatePlacementsDropped++;
      continue;
    }
    seenPlacementKeys.add(placementKey);
    placements.push(normalizePlacement(entry, skillDescMap));
  }

  return { questions, placements, quarantined, duplicatePlacementsDropped };
}

function summarize(result: BuildResult): void {
  const { questions, placements, quarantined, duplicatePlacementsDropped } = result;
  const bySource = { qbank: 0, saic: 0 };
  const byType = { mcq: 0, spr: 0 };
  let withEmbeddedImages = 0;
  let sprWithNoAnswer = 0;
  let mcqWithNoAnswer = 0;
  for (const q of questions) {
    bySource[q.contentSource]++;
    byType[q.type]++;
    if (q.hasEmbeddedMathImages) withEmbeddedImages++;
    if (q.contentSource === "saic" && q.correctAnswer.length === 0) {
      if (q.type === "spr") sprWithNoAnswer++;
      else mcqWithNoAnswer++;
    }
  }

  console.log("== Normalization summary ==");
  console.log(`  questions: ${questions.length} (qbank=${bySource.qbank} saic=${bySource.saic})`);
  console.log(`  by type: mcq=${byType.mcq} spr=${byType.spr}`);
  console.log(`  placements: ${placements.length}`);
  console.log(`  duplicate placements dropped: ${duplicatePlacementsDropped}`);
  console.log(`  quarantined questions: ${quarantined.length}`);
  console.log(
    `  questions with an unresolved (no-alt-text) math image: ${withEmbeddedImages}`,
  );
  console.log(
    `  IBN SPR questions with no recoverable correct answer (CB provides none): ${sprWithNoAnswer}`,
  );
  console.log(
    `  IBN MCQ questions with no "correct_choice" field at all (CB provides none): ${mcqWithNoAnswer}`,
  );
  const byAssessment = new Map<string, number>();
  for (const p of placements) {
    byAssessment.set(p.assessment, (byAssessment.get(p.assessment) ?? 0) + 1);
  }
  for (const [assessment, count] of byAssessment) {
    console.log(`    ${assessment}: ${count}`);
  }
}

async function writeToDb(result: BuildResult, mode: "reload" | "upsert"): Promise<void> {
  const { db } = await import("../src/prisma/db");

  const truncatePlan =
    mode === "reload"
      ? db.raw.sql`TRUNCATE TABLE public.question_assessment, public.question`.affectedCount().build()
      : null;

  function questionInsertPlan(rows: NormalizedQuestion[]) {
    return db.raw.sql`
      INSERT INTO public.question (
        id, "externalId", ibn, "contentSource", type, stem, stimulus, rationale,
        "answerOptions", "correctKeys", "correctAnswer",
        "vaultId", origin, "templateClusterId", "templateClusterName",
        "parentTemplateId", "parentTemplateName", "positionIndex",
        raw, "contentHash", "hasEmbeddedMathImages", "fetchedAt"
      )
      SELECT
        id, "externalId", ibn, "contentSource", type, stem, stimulus, rationale,
        "answerOptions", "correctKeys", "correctAnswer",
        "vaultId", origin, "templateClusterId", "templateClusterName",
        "parentTemplateId", "parentTemplateName", "positionIndex",
        raw, "contentHash", "hasEmbeddedMathImages", "fetchedAt"::timestamptz
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(
        id text, "externalId" text, ibn text, "contentSource" text, type text,
        stem text, stimulus text, rationale text,
        "answerOptions" jsonb, "correctKeys" text[], "correctAnswer" text[],
        "vaultId" text, origin text, "templateClusterId" text, "templateClusterName" text,
        "parentTemplateId" text, "parentTemplateName" text, "positionIndex" int,
        raw jsonb, "contentHash" text, "hasEmbeddedMathImages" boolean, "fetchedAt" text
      )
      ON CONFLICT (id) DO UPDATE SET
        "externalId" = EXCLUDED."externalId", ibn = EXCLUDED.ibn,
        "contentSource" = EXCLUDED."contentSource", type = EXCLUDED.type,
        stem = EXCLUDED.stem, stimulus = EXCLUDED.stimulus, rationale = EXCLUDED.rationale,
        "answerOptions" = EXCLUDED."answerOptions", "correctKeys" = EXCLUDED."correctKeys",
        "correctAnswer" = EXCLUDED."correctAnswer",
        "vaultId" = EXCLUDED."vaultId", origin = EXCLUDED.origin,
        "templateClusterId" = EXCLUDED."templateClusterId",
        "templateClusterName" = EXCLUDED."templateClusterName",
        "parentTemplateId" = EXCLUDED."parentTemplateId",
        "parentTemplateName" = EXCLUDED."parentTemplateName",
        "positionIndex" = EXCLUDED."positionIndex",
        raw = EXCLUDED.raw, "contentHash" = EXCLUDED."contentHash",
        "hasEmbeddedMathImages" = EXCLUDED."hasEmbeddedMathImages",
        "fetchedAt" = EXCLUDED."fetchedAt"
      WHERE public.question."contentHash" IS DISTINCT FROM EXCLUDED."contentHash"
    `
      .affectedCount()
      .build();
  }

  function placementInsertPlan(rows: NormalizedPlacement[]) {
    return db.raw.sql`
      INSERT INTO public.question_assessment (
        assessment, "questionId", "asmtEventId", program, section, "sectionCode",
        "domainCode", "domainDesc", "skillCode", "skillDesc", difficulty, "scoreBand",
        "bankQuestionId", "uId", "pPcc", "createDate", "updateDate", "listRaw"
      )
      SELECT
        assessment, "questionId", "asmtEventId", program, section, "sectionCode",
        "domainCode", "domainDesc", "skillCode", "skillDesc", difficulty, "scoreBand",
        "bankQuestionId", "uId", "pPcc",
        "createDate"::timestamptz, "updateDate"::timestamptz, "listRaw"
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(
        assessment text, "questionId" text, "asmtEventId" int, program text,
        section int, "sectionCode" text, "domainCode" text, "domainDesc" text,
        "skillCode" text, "skillDesc" text, difficulty text, "scoreBand" int,
        "bankQuestionId" text, "uId" text, "pPcc" text,
        "createDate" text, "updateDate" text, "listRaw" jsonb
      )
      ON CONFLICT (assessment, "questionId") DO UPDATE SET
        "asmtEventId" = EXCLUDED."asmtEventId", program = EXCLUDED.program,
        section = EXCLUDED.section, "sectionCode" = EXCLUDED."sectionCode",
        "domainCode" = EXCLUDED."domainCode", "domainDesc" = EXCLUDED."domainDesc",
        "skillCode" = EXCLUDED."skillCode", "skillDesc" = EXCLUDED."skillDesc",
        difficulty = EXCLUDED.difficulty, "scoreBand" = EXCLUDED."scoreBand",
        "bankQuestionId" = EXCLUDED."bankQuestionId", "uId" = EXCLUDED."uId",
        "pPcc" = EXCLUDED."pPcc", "createDate" = EXCLUDED."createDate",
        "updateDate" = EXCLUDED."updateDate", "listRaw" = EXCLUDED."listRaw"
    `
      .affectedCount()
      .build();
  }

  try {
    await db.transaction(async (tx) => {
      if (truncatePlan) await tx.execute(truncatePlan);

      let questionsWritten = 0;
      for (const c of chunk(result.questions, 250)) {
        const { affectedRows } = await tx.execute(questionInsertPlan(c));
        questionsWritten += affectedRows;
      }
      console.log(`  questions written: ${questionsWritten}`);

      let placementsWritten = 0;
      for (const c of chunk(result.placements, 500)) {
        const { affectedRows } = await tx.execute(placementInsertPlan(c));
        placementsWritten += affectedRows;
      }
      console.log(`  placements written: ${placementsWritten}`);
    });
  } finally {
    await db.close();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const entries = await loadListEntries();
  const result = await buildRows(entries, args.limit);
  summarize(result);

  if (result.quarantined.length > 0) {
    await writeJsonAtomic(`${QUARANTINE_DIR}/load-quarantine.json`, result.quarantined);
    console.warn(
      `  ${result.quarantined.length} question(s) quarantined — see ${QUARANTINE_DIR}/load-quarantine.json`,
    );
  }

  if (args.dryRun) {
    console.log("  --dry-run: no database writes performed.");
    return;
  }

  console.log(`== Writing to database (mode=${args.mode}) ==`);
  await writeToDb(result, args.mode);
  console.log("  done.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
