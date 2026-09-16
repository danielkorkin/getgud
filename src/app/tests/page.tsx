import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/prisma/db";
import { getCurrentProfile } from "@/lib/profile";
import { EXAMS, isExamVisible } from "@/exams";
import { checkExamAvailability } from "@/lib/exam/availability";
import { startExam } from "@/actions/exams";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClockIcon, WarningCircleIcon, BooksIcon, HouseIcon } from "@phosphor-icons/react/dist/ssr";

export default async function TestsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/");

  const visibleExams = EXAMS.filter(isExamVisible);

  const rows = await Promise.all(
    visibleExams.map(async (bp) => {
      const availability = await checkExamAvailability(bp);
      const sessions = await db.orm.public.ExamSession
        .where({ profileId: profile.id, examId: bp.id })
        .all();
      const setIds = sessions.map((sess) => sess.setId);
      const sets = setIds.length > 0 ? await db.orm.public.PracticeSet.where((s) => s.id.in(setIds)).all() : [];
      const setById = new Map(sets.map((s) => [s.id, s]));
      const latest = sessions
        .map((s) => ({ session: s, set: setById.get(s.setId) }))
        .filter((r): r is { session: (typeof sessions)[number]; set: NonNullable<(typeof sets)[number]> } => Boolean(r.set))
        .sort((a, b) => new Date(b.session.createdAt).getTime() - new Date(a.session.createdAt).getTime())[0];
      return { bp, availability, latest };
    }),
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs tracking-[0.05em] text-muted-foreground uppercase">Formal practice</span>
          <h1 className="font-serif text-4xl tracking-tight">Practice tests</h1>
          <p className="text-sm text-muted-foreground">
            Full-length, timed, adaptive — the same test on every self-hosted copy of Getgud.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" render={<Link href="/sets" />} nativeButton={false}>
            <BooksIcon data-icon="inline-start" />
            Practice sets
          </Button>
          <Button variant="ghost" size="sm" render={<Link href="/" />} nativeButton={false}>
            <HouseIcon data-icon="inline-start" />
            Home
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map(({ bp, availability, latest }) => {
          const totalMinutes = bp.sections.reduce((sum, s) => sum + s.minutesPerModule * 2, 0) + bp.breakMinutes;
          const status = latest?.set.status;
          return (
            <Card key={bp.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{bp.name}</CardTitle>
                  {status === "in_progress" && <Badge variant="tag-blue">In progress</Badge>}
                  {status === "completed" && <Badge variant="tag-green">Completed</Badge>}
                </div>
                <CardDescription className="flex items-center gap-1.5">
                  <ClockIcon className="size-3.5" />
                  {totalMinutes} min · {bp.assessment}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {!availability.available && (
                  <p className="flex items-start gap-1.5 text-sm text-destructive">
                    <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
                    This instance is missing {availability.missingIds.length} question(s) this test needs. Re-run{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">pnpm scrape</code> and{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">pnpm load</code>.
                  </p>
                )}
                {status === "completed" && latest?.session.totalScaled != null && (
                  <p className="font-mono text-sm text-muted-foreground">
                    Last score: <span className="font-medium text-foreground">{latest.session.totalScaled}</span> / 1600
                  </p>
                )}
                {status === "in_progress" && latest ? (
                  <Button render={<Link href={`/tests/${latest.session.setId}`} />} nativeButton={false}>
                    Resume
                  </Button>
                ) : (
                  <form
                    action={async () => {
                      "use server";
                      await startExam(bp.id);
                    }}
                  >
                    <Button type="submit" disabled={!availability.available}>
                      {status === "completed" ? "Retake" : "Start test"}
                    </Button>
                  </form>
                )}
                {status === "completed" && latest && (
                  <Button
                    variant="ghost"
                    size="sm"
                    render={<Link href={`/tests/${latest.session.setId}/results`} />}
                    nativeButton={false}
                  >
                    View results
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
