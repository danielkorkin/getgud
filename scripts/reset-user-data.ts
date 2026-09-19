// Wipes every profile and everything that hangs off a profile — practice
// sets, attempts, exam sessions/modules, event telemetry — while leaving the
// College Board question bank (question, question_assessment) and the AI
// hint cache (question_hint, shared across profiles, expensive to
// regenerate) completely untouched. Safe to run any time; does not touch
// the scrape/convert/load pipeline's output at all.
//
// TRUNCATE ... CASCADE on `profile` is sufficient on its own: every
// user-data table (practice_set, practice_set_item, attempt, attempt_event,
// attempt_hint, exam_session, exam_module) is reachable from `profile` via a
// chain of `onDelete: Cascade` foreign keys (see contract.prisma), and
// Postgres's CASCADE truncates the whole dependency chain transitively, not
// just direct references. Nothing that only *references* profile-owned rows
// (question, question_assessment, question_hint — all referenced BY those
// tables, never the reverse) gets touched, because TRUNCATE CASCADE only
// follows the "who points at me" direction.
//
// Dry-run by default — pass --yes to actually execute.

import { db } from "../src/prisma/db";

async function countAll() {
  const [profile, practiceSet, attempt, examSession, question, questionAssessment, questionHint] = await Promise.all([
    db.orm.public.Profile.aggregate((a) => ({ n: a.count() })),
    db.orm.public.PracticeSet.aggregate((a) => ({ n: a.count() })),
    db.orm.public.Attempt.aggregate((a) => ({ n: a.count() })),
    db.orm.public.ExamSession.aggregate((a) => ({ n: a.count() })),
    db.orm.public.Question.aggregate((a) => ({ n: a.count() })),
    db.orm.public.QuestionAssessment.aggregate((a) => ({ n: a.count() })),
    db.orm.public.QuestionHint.aggregate((a) => ({ n: a.count() })),
  ]);
  return {
    profile: profile.n,
    practiceSet: practiceSet.n,
    attempt: attempt.n,
    examSession: examSession.n,
    question: question.n,
    questionAssessment: questionAssessment.n,
    questionHint: questionHint.n,
  };
}

async function main(): Promise<void> {
  const confirmed = process.argv.includes("--yes");

  console.log("== Before ==");
  const before = await countAll();
  console.log(`  profile: ${before.profile}`);
  console.log(`  practice_set: ${before.practiceSet}`);
  console.log(`  attempt: ${before.attempt}`);
  console.log(`  exam_session: ${before.examSession}`);
  console.log(`  (preserved) question: ${before.question}`);
  console.log(`  (preserved) question_assessment: ${before.questionAssessment}`);
  console.log(`  (preserved) question_hint: ${before.questionHint}`);

  if (!confirmed) {
    console.log(
      "\nDry run — no changes made. Re-run with --yes to permanently delete every profile and all practice/exam history above, keeping the question bank and hint cache.",
    );
    await db.close();
    return;
  }

  console.log("\nTruncating profile (cascades to practice_set, practice_set_item, attempt, attempt_event, attempt_hint, exam_session, exam_module)...");
  const plan = db.raw.sql`TRUNCATE TABLE public.profile CASCADE`.affectedCount().build();
  await db.transaction(async (tx) => {
    await tx.execute(plan);
  });

  console.log("\n== After ==");
  const after = await countAll();
  console.log(`  profile: ${after.profile}`);
  console.log(`  practice_set: ${after.practiceSet}`);
  console.log(`  attempt: ${after.attempt}`);
  console.log(`  exam_session: ${after.examSession}`);
  console.log(`  (preserved) question: ${after.question}`);
  console.log(`  (preserved) question_assessment: ${after.questionAssessment}`);
  console.log(`  (preserved) question_hint: ${after.questionHint}`);

  await db.close();
}

main().catch(async (err: unknown) => {
  console.error(err);
  await db.close();
  process.exit(1);
});
