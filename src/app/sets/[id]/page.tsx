import { redirect, notFound } from "next/navigation";
import { db } from "@/prisma/db";
import { getCurrentProfile } from "@/lib/profile";
import { hintsConfigured } from "@/lib/ai/hint-provider";
import { PracticeRunner } from "@/components/practice/practice-runner";
import type { NavItemState } from "@/components/practice/question-nav";

export default async function RunnerPage({ params }: PageProps<"/sets/[id]">) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/");

  const set = await db.orm.public.PracticeSet.first({ id, profileId: profile.id });
  if (!set) notFound();
  if (set.mode === "exam") redirect(`/tests/${id}`);
  if (set.status === "completed") redirect(`/sets/${id}/results`);

  const items = await db.orm.public.PracticeSetItem
    .where({ setId: id })
    .orderBy((i) => i.position.asc())
    .all();
  const attempts = await db.orm.public.Attempt.where({ setId: id }).all();
  const attemptByItemId = new Map(attempts.map((a) => [a.itemId, a]));

  const navItems: NavItemState[] = items.map((item) => {
    const attempt = attemptByItemId.get(item.id);
    return {
      position: item.position,
      status: (attempt?.status ?? "unanswered") as NavItemState["status"],
      isCorrect: attempt?.isCorrect ?? null,
      markedForReview: attempt?.markedForReview ?? false,
    };
  });

  return (
    <PracticeRunner
      setId={set.id}
      setName={set.name}
      questionCount={set.questionCount}
      startPosition={Math.min(set.currentIndex, set.questionCount - 1)}
      initialItems={navItems}
      hintsEnabled={hintsConfigured()}
    />
  );
}
