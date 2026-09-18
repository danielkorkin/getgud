// Home — the shared entry point to the two halves of the app.
//
// The body is organized as Learn / Practice rather than as one flat list of
// recent activity, because those are the two things the site does and a
// student arriving cold needs to see both. Continue-where-you-left-off
// cards stay above that split: if there's an unfinished test, that's more
// actionable than either half's overview.
//
// The no-profile branch links into Learn deliberately. The Learn half needs
// no profile and no database, so someone on a fresh clone — before
// `pnpm scrape` has ever run — has somewhere to go instead of a dead end.

import Link from "next/link";
import { db } from "@/prisma/db";
import { getCurrentProfile } from "@/lib/profile";
import { FEATURED_GUIDES, GUIDES, RESOURCES } from "@/resources";
import { CreateProfileForm } from "@/components/practice/create-profile-form";
import { GuideCard } from "@/components/learn/guide-card";
import { SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Reveal } from "@/components/reveal";
import {
  PlusIcon,
  BooksIcon,
  ExamIcon,
  GraduationCapIcon,
  LightbulbIcon,
  StackIcon,
} from "@phosphor-icons/react/dist/ssr";

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
        <Button variant="ghost" size="sm" render={<Link href="/learn" />} nativeButton={false}>
          <GraduationCapIcon data-icon="inline-start" />
          Or browse the study guides first
        </Button>
      </div>
    );
  }

  const inProgress = await db.orm.public.PracticeSet
    .where({ profileId: profile.id, status: "in_progress", mode: "practice" })
    .orderBy((s) => s.createdAt.desc())
    .first();

  const recent = await db.orm.public.PracticeSet
    .where({ profileId: profile.id, mode: "practice" })
    .where((s) => s.status.eq("completed"))
    .orderBy((s) => s.completedAt.desc())
    .limit(4)
    .all();

  const inProgressExamSet = await db.orm.public.PracticeSet
    .where({ profileId: profile.id, status: "in_progress", mode: "exam" })
    .orderBy((s) => s.createdAt.desc())
    .first();

  const recentExamSets = await db.orm.public.PracticeSet
    .where({ profileId: profile.id, mode: "exam" })
    .where((s) => s.status.eq("completed"))
    .orderBy((s) => s.completedAt.desc())
    .limit(2)
    .all();
  const recentExamSessions =
    recentExamSets.length > 0
      ? await db.orm.public.ExamSession.where((s) => s.setId.in(recentExamSets.map((set) => set.id))).all()
      : [];
  const examSessionBySetId = new Map(recentExamSessions.map((s) => [s.setId, s]));

  return (
    <>
      <SiteNav />
      <div className="isolate mx-auto flex w-full max-w-4xl flex-col gap-12 px-6 py-16">
        <div aria-hidden className="ambient-glow pointer-events-none fixed inset-0 -z-10" />

        <header className="flex flex-col gap-1">
          <span className="text-xs tracking-[0.05em] text-muted-foreground uppercase">Getgud</span>
          <h1 className="font-serif text-4xl tracking-tight">Welcome back, {profile.name}</h1>
        </header>

        {(inProgressExamSet || inProgress) && (
          <section className="flex flex-col gap-3">
            {inProgressExamSet && (
              <Reveal index={0}>
                <Link href={`/tests/${inProgressExamSet.id}`} className="block">
                  <Card interactive>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle>Continue: {inProgressExamSet.name}</CardTitle>
                        <Badge variant="tag-blue">Practice test</Badge>
                      </div>
                      <CardDescription>
                        Pick up where you left off — modules are timed and locked once submitted.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </Reveal>
            )}

            {inProgress && (
              <Reveal index={inProgressExamSet ? 1 : 0}>
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
          </section>
        )}

        {/* The split. Two halves, stated plainly, before any activity feed. */}
        <Reveal index={2}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link href="/learn" className="block h-full">
              <Card interactive className="h-full">
                <CardHeader>
                  <span className="flex size-8 items-center justify-center rounded-lg border border-border">
                    <GraduationCapIcon className="size-4" />
                  </span>
                  <CardTitle className="mt-3 font-serif text-2xl tracking-tight">Learn</CardTitle>
                  <CardDescription className="leading-relaxed">
                    Guides, cheat sheets, and vetted resources — what to study and where to study it.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">{GUIDES.length} guides</Badge>
                    <Badge variant="outline">{RESOURCES.length} resources</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/sets" className="block h-full">
              <Card interactive className="h-full">
                <CardHeader>
                  <span className="flex size-8 items-center justify-center rounded-lg border border-border">
                    <ExamIcon className="size-4" />
                  </span>
                  <CardTitle className="mt-3 font-serif text-2xl tracking-tight">Practice</CardTitle>
                  <CardDescription className="leading-relaxed">
                    Targeted drill sets from the official question bank, and full-length adaptive practice tests.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">Drill by skill</Badge>
                    <Badge variant="outline">Timed &amp; adaptive</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </Reveal>

        <Reveal index={3}>
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-serif text-xl tracking-tight">Study next</h2>
              <Button variant="ghost" size="sm" render={<Link href="/learn/guides" />} nativeButton={false}>
                <LightbulbIcon data-icon="inline-start" />
                All guides
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FEATURED_GUIDES.slice(0, 2).map((guide) => (
                <GuideCard key={guide.id} guide={guide} />
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal index={4}>
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-serif text-xl tracking-tight">Practice tests</h2>
              <Button variant="ghost" size="sm" render={<Link href="/tests" />} nativeButton={false}>
                <ExamIcon data-icon="inline-start" />
                View all
              </Button>
            </div>
            {recentExamSets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No completed practice tests yet — full-length, timed, and adaptive, just like the real SAT.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {recentExamSets.map((set) => {
                  const session = examSessionBySetId.get(set.id);
                  return (
                    <Link key={set.id} href={`/tests/${set.id}/results`} className="block">
                      <Card interactive>
                        <CardHeader>
                          <CardTitle className="text-base">{set.name}</CardTitle>
                          <CardDescription>
                            {session?.totalScaled != null ? `${session.totalScaled} / 1600` : "Score unavailable"}
                          </CardDescription>
                        </CardHeader>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </Reveal>

        <Reveal index={5}>
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-serif text-xl tracking-tight">Recent sets</h2>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" render={<Link href="/new" />} nativeButton={false}>
                  <PlusIcon data-icon="inline-start" />
                  New set
                </Button>
                <Button variant="ghost" size="sm" render={<Link href="/sets" />} nativeButton={false}>
                  <BooksIcon data-icon="inline-start" />
                  View all
                </Button>
              </div>
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

        <Reveal index={6}>
          <Link href="/learn/resources" className="block">
            <Card interactive>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <CardTitle className="text-base">Browse every resource</CardTitle>
                    <CardDescription>
                      Official College Board material, free courses, channels, tools, and books — filterable.
                    </CardDescription>
                  </div>
                  <StackIcon className="size-5 shrink-0 text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>
          </Link>
        </Reveal>
      </div>
    </>
  );
}
