import "server-only";

import { db } from "@/prisma/db";
import type { ExamBlueprint } from "@/exams/spec";

export interface ExamAvailability {
  available: boolean;
  missingIds: string[];
}

/**
 * Whether every question id a blueprint names actually exists in this
 * instance's loaded question bank. Per the user's decision, a missing id
 * means the test refuses to start entirely — never a silent substitution —
 * because the whole point of a premade test is that it's identical on
 * every self-hosted instance that can run it at all.
 */
export async function checkExamAvailability(bp: ExamBlueprint): Promise<ExamAvailability> {
  const allIds = [...new Set(bp.sections.flatMap((s) => [...s.module1, ...s.module2Lower, ...s.module2Upper]))];
  const rows = await db.orm.public.Question.where((q) => q.id.in(allIds)).all();
  const found = new Set(rows.map((r) => r.id));
  const missingIds = allIds.filter((id) => !found.has(id));
  return { available: missingIds.length === 0, missingIds };
}
