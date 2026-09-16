import Link from "next/link";
import { db } from "@/prisma/db";
import { getCurrentProfile } from "@/lib/profile";
import { CreateProfileForm } from "@/components/practice/create-profile-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Reveal } from "@/components/reveal";
import { PlusIcon, BooksIcon } from "@phosphor-icons/react/dist/ssr";

const DIFFICULTY_VARIANT = { E: "tag-green", M: "tag-yellow", H: "tag-red" } as const;

export default async function HomePage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <div className="isolate flex min-h-screen flex-col items-center justify-center gap-8 px-6">
        <div aria-hidden className="ambient-glow pointer-events-none fixed inset-0 -z-10" />
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-serif text-4xl tracking-tight">Getgud</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            A focused SAT & PSAT practice tool, running locally on your own machine.
          </p>
        </div>
        <CreateProfileForm />
      </div>
    );
  }

  const inProgress = await db.orm.public.PracticeSet
    .where({ profileId: profile.id, status: "in_progress" })
    .orderBy((s) => s.createdAt.desc())
    .first();

  const recent = await db.orm.public.PracticeSet
    .where({ profileId: profile.id })
    .where((s) => s.status.eq("completed"))
    .orderBy((s) => s.completedAt.desc())
    .limit(5)
    .all();

  return (
    <div className="isolate mx-auto flex w-full max-w-4xl flex-col gap-12 px-6 py-16">
      <div aria-hidden className="ambient-glow pointer-events-none fixed inset-0 -z-10" />
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs tracking-[0.05em] text-muted-foreground uppercase">Getgud</span>
          <h1 className="font-serif text-4xl tracking-tight">Welcome back, {profile.name}</h1>
        </div>
        <Button render={<Link href="/new" />} nativeButton={false}>
          <PlusIcon data-icon="inline-start" />
          New set
        </Button>
      </header>

      {inProgress && (
        <Reveal index={0}>
          <Link href={`/sets/${inProgress.id}`} className="block">
            <Card interactive>
              <CardHeader>
                <CardTitle>Continue: {inProgress.name}</CardTitle>
                <CardDescription>
                  Question {inProgress.currentIndex + 1} of {inProgress.questionCount}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Progress value={(inProgress.currentIndex / Math.max(inProgress.questionCount, 1)) * 100} />
              </CardContent>
            </Card>
          </Link>
        </Reveal>
      )}

      <Reveal index={1}>
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl tracking-tight">Recent sets</h2>
            <Button variant="ghost" size="sm" render={<Link href="/sets" />} nativeButton={false}>
              <BooksIcon data-icon="inline-start" />
              View all
            </Button>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No completed sets yet — build your first one to get started.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {recent.map((set) => {
                const pct = set.gradedCount > 0 ? Math.round((set.correctCount / set.gradedCount) * 100) : null;
                return (
                  <Link key={set.id} href={`/sets/${set.id}/results`} className="block">
                    <Card interactive>
                      <CardHeader>
                        <CardTitle className="text-base">{set.name}</CardTitle>
                        <CardDescription>
                          {set.questionCount} questions
                          {pct !== null && ` · ${pct}% correct`}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-1.5">
                        {set.difficulties.map((d) => (
                          <Badge key={d} variant={DIFFICULTY_VARIANT[d as "E" | "M" | "H"] ?? "secondary"}>
                            {d}
                          </Badge>
                        ))}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </Reveal>
    </div>
  );
}
