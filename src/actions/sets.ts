"use server";

import { redirect } from "next/navigation";
import { db } from "@/prisma/db";
import { toJsonValue } from "@/lib/json";
import { requireProfileId } from "@/lib/profile";
import {
  countMatchingQuestions,
  sampleQuestions,
  validateSetFilters,
  type RawSetFilters,
} from "@/lib/query/generate-set";

export async function countMatching(raw: RawSetFilters): Promise<{ count: number } | { error: string }> {
  const validated = validateSetFilters(raw);
  if (!validated.ok) return { error: validated.error };
  const profileId = raw.excludeAttempted ? await requireProfileId() : null;
  const count = await countMatchingQuestions(validated.filters, profileId);
  return { count };
}

function defaultSetName(raw: RawSetFilters): string {
  const sections = raw.sectionCodes.length === 1 ? raw.sectionCodes[0] : "Full";
  const difficulty = raw.difficulties.length === 1 ? raw.difficulties[0] : "Mixed";
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${raw.assessment} · ${sections} · ${difficulty} · ${date}`;
}

export async function createSet(
  raw: RawSetFilters,
  name?: string,
): Promise<{ error: string } | void> {
  const validated = validateSetFilters(raw);
  if (!validated.ok) return { error: validated.error };
  const filters = validated.filters;

  const profileId = await requireProfileId();
  const sampled = await sampleQuestions(filters, filters.excludeAttempted ? profileId : null);
  if (sampled.length === 0) {
    return { error: "No questions match these filters. Try widening them." };
  }

  const setId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.transaction(async (tx) => {
    await tx.orm.public.PracticeSet.create({
      id: setId,
      profileId,
      name: (name ?? "").trim() || defaultSetName(raw),
      status: "in_progress",
      mode: "practice",
      config: toJsonValue(filters),
      assessment: filters.assessment,
      sectionCodes: filters.sectionCodes,
      difficulties: filters.difficulties,
      questionCount: sampled.length,
      currentIndex: 0,
      correctCount: 0,
      gradedCount: 0,
      totalActiveMs: 0,
      createdAt: now,
      startedAt: now,
    });

    for (const [index, q] of sampled.entries()) {
      await tx.orm.public.PracticeSetItem.create({
        id: crypto.randomUUID(),
        setId,
        position: index,
        questionId: q.questionId,
        assessment: filters.assessment,
        sectionCode: q.sectionCode,
        domainCode: q.domainCode,
        skillCode: q.skillCode,
        difficulty: q.difficulty,
        scoreBand: q.scoreBand,
        type: q.type,
        gradable: true,
      });
    }
  });

  redirect(`/sets/${setId}`);
}

export async function abandonSet(setId: string): Promise<void> {
  const profileId = await requireProfileId();
  await db.orm.public.PracticeSet.where({ id: setId, profileId }).update({ status: "abandoned" });
  redirect("/sets");
}
