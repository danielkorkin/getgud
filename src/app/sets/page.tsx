import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/prisma/db";
import { getCurrentProfile } from "@/lib/profile";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteNav } from "@/components/site-nav";
import { PlusIcon } from "@phosphor-icons/react/dist/ssr";

const STATUS_LABEL: Record<string, string> = {
  in_progress: "In progress",
  completed: "Completed",
  abandoned: "Abandoned",
};
const STATUS_VARIANT: Record<string, "tag-blue" | "tag-green" | "secondary"> = {
  in_progress: "tag-blue",
  completed: "tag-green",
  abandoned: "secondary",
};

export default async function SetsLibraryPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/");

  const sets = await db.orm.public.PracticeSet
    .where({ profileId: profile.id, mode: "practice" })
    .orderBy((s) => s.createdAt.desc())
    .limit(100)
    .all();

  return (
    <>
      <SiteNav />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs tracking-[0.05em] text-muted-foreground uppercase">Library</span>
          <h1 className="text-4xl font-medium tracking-tight">Your practice sets</h1>
        </div>
        <Button render={<Link href="/new" />} nativeButton={false}>
          <PlusIcon data-icon="inline-start" />
          New set
        </Button>
      </header>

      {sets.length === 0 ? (
        <p className="text-sm text-muted-foreground">You haven&apos;t built a set yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {sets.map((set) => {
            const href = set.status === "in_progress" ? `/sets/${set.id}` : `/sets/${set.id}/results`;
            const pct = set.gradedCount > 0 ? Math.round((set.correctCount / set.gradedCount) * 100) : null;
            return (
              <Link key={set.id} href={href} className="block">
                <Card interactive>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{set.name}</CardTitle>
                      <Badge variant={STATUS_VARIANT[set.status] ?? "secondary"}>
                        {STATUS_LABEL[set.status] ?? set.status}
                      </Badge>
                    </div>
                    <CardDescription>
                      {set.assessment} · {set.questionCount} questions
                      {pct !== null && ` · ${pct}% correct`}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      </div>
    </>
  );
}
