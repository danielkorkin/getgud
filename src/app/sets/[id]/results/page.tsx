import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { db } from "@/prisma/db";
import { getCurrentProfile } from "@/lib/profile";
import { domainLabel, skillLabel } from "@/lib/catalog";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircleIcon,
  XCircleIcon,
  MinusCircleIcon,
  FlagIcon,
  ArrowLeftIcon,
  LightbulbIcon,
  EyeIcon,
  GraduationCapIcon,
} from "@phosphor-icons/react/dist/ssr";

const DIFFICULTY_VARIANT = { E: "tag-green", M: "tag-yellow", H: "tag-red" } as const;

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default async function ResultsPage({ params }: PageProps<"/sets/[id]/results">) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/");

  const set = await db.orm.public.PracticeSet.first({ id, profileId: profile.id });
  if (!set) notFound();
  if (set.mode === "exam") redirect(`/tests/${id}/results`);

  const items = await db.orm.public.PracticeSetItem
    .where({ setId: id })
    .orderBy((i) => i.position.asc())
    .all();
  const attempts = await db.orm.public.Attempt.where({ setId: id }).all();
  const attemptByItemId = new Map(attempts.map((a) => [a.itemId, a]));

  const accuracy = set.gradedCount > 0 ? Math.round((set.correctCount / set.gradedCount) * 100) : null;
  const totalHints = attempts.reduce((sum, a) => sum + a.hintsUsed, 0);
  const revealedCount = attempts.filter((a) => a.answerRevealed).length;
  const avgActiveMs = attempts.length > 0 ? Math.round(set.totalActiveMs / attempts.length) : 0;

  // Carries domainCode alongside the counts because the Learn link needs
  // it — /learn/topics/[domain] is keyed by domain, with the skill as a
  // fragment. Deriving it here avoids a second lookup in the render.
  const bySkill = new Map<string, { correct: number; graded: number; domainCode: string }>();
  for (const item of items) {
    const attempt = attemptByItemId.get(item.id);
    if (!attempt || attempt.status !== "answered" || !attempt.gradable) continue;
    const entry = bySkill.get(item.skillCode) ?? { correct: 0, graded: 0, domainCode: item.domainCode };
    entry.graded += 1;
    if (attempt.isCorrect) entry.correct += 1;
    bySkill.set(item.skillCode, entry);
  }

  // Weakest first. The point of this section is deciding what to study
  // next, and insertion order (i.e. the order questions happened to appear
  // in the set) carries no information about that.
  const skillRows = [...bySkill.entries()]
    .map(([skillCode, stats]) => ({ skillCode, ...stats, rate: stats.correct / stats.graded }))
    .sort((a, b) => a.rate - b.rate || b.graded - a.graded);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-1">
        <Button variant="ghost" size="sm" className="self-start" render={<Link href="/sets" />} nativeButton={false}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back to library
        </Button>
        <h1 className="text-4xl font-medium tracking-tight">{set.name}</h1>
        <p className="text-sm text-muted-foreground">
          {set.assessment} · {set.questionCount} questions
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Accuracy" value={accuracy !== null ? `${accuracy}%` : "—"} />
        <StatCard label="Graded" value={`${set.gradedCount}/${set.questionCount}`} />
        <StatCard label="Avg. time / question" value={formatDuration(avgActiveMs)} />
        <StatCard label="Hints used" value={String(totalHints)} />
        <StatCard label="Revealed" value={String(revealedCount)} />
      </div>

      {skillRows.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-medium tracking-tight">By skill</h2>
            <p className="text-sm text-muted-foreground">Weakest first. Each one links to its study guides.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            {skillRows.map(({ skillCode, correct, graded, domainCode }) => (
              <Link
                key={skillCode}
                href={`/learn/topics/${domainCode}#skill-${skillCode}`}
                className="group flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
              >
                <span>{skillLabel(skillCode)}</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-muted-foreground">
                    {correct}/{graded}
                  </span>
                  <GraduationCapIcon className="size-4 shrink-0 text-muted-foreground transition-opacity opacity-0 group-hover:opacity-100" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-medium tracking-tight">Question review</h2>
        <div className="flex flex-col gap-1.5">
          {items.map((item) => {
            const attempt = attemptByItemId.get(item.id);
            const answered = attempt?.status === "answered";
            return (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm"
              >
                <span className="w-6 shrink-0 font-mono text-muted-foreground">{item.position + 1}</span>
                {answered && attempt?.isCorrect === true && (
                  <CheckCircleIcon weight="fill" className="size-4 shrink-0 text-tag-green-foreground" />
                )}
                {answered && attempt?.isCorrect === false && (
                  <XCircleIcon weight="fill" className="size-4 shrink-0 text-tag-red-foreground" />
                )}
                {(!answered || attempt?.isCorrect === null) && (
                  <MinusCircleIcon className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 truncate">
                  {domainLabel(item.domainCode)} — {skillLabel(item.skillCode)}
                </span>
                <Badge variant={DIFFICULTY_VARIANT[item.difficulty as "E" | "M" | "H"] ?? "secondary"}>
                  {item.difficulty}
                </Badge>
                {attempt?.markedForReview && (
                  <FlagIcon weight="fill" className="size-4 shrink-0 text-tag-yellow-foreground" />
                )}
                {(attempt?.hintsUsed ?? 0) > 0 && (
                  <LightbulbIcon weight="fill" className="size-4 shrink-0 text-tag-blue-foreground" />
                )}
                {attempt?.answerRevealed && (
                  <EyeIcon weight="fill" className="size-4 shrink-0 text-tag-red-foreground" />
                )}
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatDuration(attempt?.activeMs ?? 0)}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-2xl">{value}</CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
    </Card>
  );
}
