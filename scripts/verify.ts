// Verify the loaded College Board question bank data. Run after every
// `pnpm load`. Exits non-zero if a hard invariant is violated. A few counts
// are reported as known, understood gaps (see comments) rather than treated
// as failures — College Board's own disclosed-item data is incomplete there.

import { db } from "../src/prisma/db";

let failures = 0;

function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Build a `SELECT count(*)::int AS n ...` raw-SQL plan. Centralizing the
 * `.returnsRow({n: "pg/int4@1"}).build()` tail gives `scalar()` a concrete,
 * inferrable plan type instead of the raw (pre-build) tag-function type. */
function countPlan(strings: TemplateStringsArray) {
  return db.raw.sql(strings).returnsRow({ n: "pg/int4@1" }).build();
}

async function scalar(plan: ReturnType<typeof countPlan>): Promise<number> {
  const rows = await db.runtime().query(plan);
  const row = rows[0] as { n: number } | undefined;
  return row?.n ?? 0;
}

async function main(): Promise<void> {
  console.log("== Row counts ==");
  const questionCount = await db.orm.public.Question.aggregate((a) => ({ n: a.count() }));
  const placementCount = await db.orm.public.QuestionAssessment.aggregate((a) => ({ n: a.count() }));
  console.log(`  question: ${questionCount.n}`);
  console.log(`  question_assessment: ${placementCount.n}`);

  const bySource = await db.orm.public.Question.groupBy("contentSource").aggregate((a) => ({
    n: a.count(),
  }));
  for (const row of bySource) console.log(`    contentSource=${row.contentSource}: ${row.n}`);

  const byAssessment = await db.orm.public.QuestionAssessment.groupBy("assessment").aggregate(
    (a) => ({ n: a.count() }),
  );
  for (const row of byAssessment) console.log(`    assessment=${row.assessment}: ${row.n}`);

  console.log("\n== Hard invariants ==");

  const orphans = await scalar(
    countPlan`
      SELECT count(*)::int AS n FROM question q
      WHERE NOT EXISTS (SELECT 1 FROM question_assessment a WHERE a."questionId" = q.id)
    `,
  );
  check("no orphaned questions (every question has >=1 placement)", orphans === 0, `${orphans} orphans`);

  const xorViolations = await scalar(
    countPlan`SELECT count(*)::int AS n FROM question WHERE ("externalId" IS NULL) = (ibn IS NULL)`,
  );
  check("exactly one of externalId/ibn is set", xorViolations === 0, `${xorViolations} violations`);

  const mcqTooFewOptions = await scalar(
    countPlan`SELECT count(*)::int AS n FROM question WHERE type='mcq' AND jsonb_array_length("answerOptions") < 2`,
  );
  check("every mcq has >=2 answerOptions", mcqTooFewOptions === 0, `${mcqTooFewOptions} violations`);

  const keysNotInOptions = await scalar(
    countPlan`
      SELECT count(*)::int AS n FROM question q WHERE q.type='mcq'
        AND NOT (q."correctKeys" <@ ARRAY(SELECT o->>'id' FROM jsonb_array_elements(q."answerOptions") o))
    `,
  );
  check("every mcq correctKeys references a real option id", keysNotInOptions === 0, `${keysNotInOptions} violations`);

  const nonMathSaic = await scalar(
    countPlan`
      SELECT count(DISTINCT q.id)::int AS n FROM question q
      JOIN question_assessment qa ON qa."questionId" = q.id
      WHERE q."contentSource" = 'saic' AND qa."sectionCode" <> 'MATH'
    `,
  );
  check("every saic (IBN) question is placed only in Math", nonMathSaic === 0, `${nonMathSaic} violations`);

  const qbankHasNoImages = await scalar(
    countPlan`SELECT count(*)::int AS n FROM question WHERE "contentSource"='qbank' AND "hasEmbeddedMathImages"`,
  );
  check(
    "no qbank question is flagged hasEmbeddedMathImages (qbank uses native MathML, never images)",
    qbankHasNoImages === 0,
    `${qbankHasNoImages} violations`,
  );

  const duplicateSkillDesc = await scalar(
    countPlan`
      SELECT count(*)::int AS n FROM (
        SELECT "skillCode" FROM question_assessment GROUP BY 1 HAVING count(DISTINCT "skillDesc") > 1
      ) x
    `,
  );
  check("every skillCode has exactly one skillDesc spelling", duplicateSkillDesc === 0, `${duplicateSkillDesc} codes`);

  // qbank MCQ options carry no explicit letter — the loader assigns A/B/C/D
  // by array position and assumes correct_answer's letter refers to that
  // same position. This confirms that assumption actually holds across the
  // whole corpus, not just the one spot-checked question.
  const positionalLetterMismatch = await scalar(countPlan`
    SELECT count(*)::int AS n FROM question q
    WHERE q.type='mcq' AND q."contentSource"='qbank'
      AND array_length(q."correctAnswer",1) = 1
      AND (q."answerOptions"->(ascii(q."correctAnswer"[1]) - 65)->>'id') IS DISTINCT FROM q."correctKeys"[1]
  `);
  check(
    "qbank mcq positional letter (A/B/C/D by array index) matches correctKeys",
    positionalLetterMismatch === 0,
    `${positionalLetterMismatch} mismatches`,
  );

  const multiAnswerMcq = await scalar(countPlan`
    SELECT count(*)::int AS n FROM question WHERE type='mcq' AND array_length("correctAnswer",1) > 1
  `);
  if (multiAnswerMcq > 0) {
    console.log(`  NOTE: ${multiAnswerMcq} mcq question(s) have more than one correct answer.`);
  }

  console.log("\n== Known, understood gaps (informational — College Board provides no data here) ==");
  const sprNoAnswer = await scalar(
    countPlan`
      SELECT count(*)::int AS n FROM question
      WHERE type='spr' AND "contentSource"='saic' AND array_length("correctAnswer",1) IS NULL
    `,
  );
  console.log(`  IBN SPR with no recoverable answer: ${sprNoAnswer}`);

  const mcqNoAnswer = await scalar(
    countPlan`
      SELECT count(*)::int AS n FROM question
      WHERE type='mcq' AND "contentSource"='saic' AND array_length("correctAnswer",1) IS NULL
    `,
  );
  console.log(`  IBN MCQ with no "correct_choice" field: ${mcqNoAnswer}`);

  const unresolvedImages = await scalar(
    countPlan`SELECT count(*)::int AS n FROM question WHERE "hasEmbeddedMathImages"`,
  );
  console.log(`  questions with an unresolved (no-alt-text) equation image: ${unresolvedImages}`);

  // Beyond the known gaps above, no question should have an empty
  // correctAnswer — that would mean a shape the normalizer mis-parsed
  // without quarantining it.
  const unexpectedEmptyAnswers = await scalar(
    countPlan`
      SELECT count(*)::int AS n FROM question
      WHERE array_length("correctAnswer",1) IS NULL
        AND NOT ("contentSource"='saic' AND (type='spr' OR type='mcq'))
    `,
  );
  check(
    "no unexplained empty correctAnswer outside the known saic gaps",
    unexpectedEmptyAnswers === 0,
    `${unexpectedEmptyAnswers} unexplained`,
  );

  console.log("\n== Spot checks (known question ids) ==");
  const mcqSpot = await db.orm.public.Question.where({ id: "52a8f1cb-bff4-4dcb-b455-fbc202e8513c" }).first();
  check("known MCQ spot-check has correctAnswer=[B]", JSON.stringify(mcqSpot?.correctAnswer) === '["B"]');

  const sprSpot = await db.orm.public.Question.where({ id: "ad6cdfd4-4643-45b2-b72d-0602fb30ce1c" }).first();
  check("known SPR spot-check has correctAnswer=[403]", JSON.stringify(sprSpot?.correctAnswer) === '["403"]');

  const ibnSpot = await db.orm.public.Question.where({ id: "022222-DC" }).first();
  check("known IBN spot-check has correctAnswer=[C]", JSON.stringify(ibnSpot?.correctAnswer) === '["C"]');

  console.log(`\n${failures === 0 ? "All hard invariants passed." : `${failures} invariant(s) FAILED.`}`);
  await db.close();
  if (failures > 0) process.exit(1);
}

main().catch(async (err: unknown) => {
  console.error(err);
  await db.close();
  process.exit(1);
});
