import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";
import { loadStatsBundle } from "@/lib/stats/load";
import { computeInsights } from "@/lib/stats/insights";
import { SiteNav } from "@/components/site-nav";
import { StatsClient } from "@/app/stats/stats-client";

export default async function StatsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/");

  const bundle = await loadStatsBundle(profile.id);
  const insights = computeInsights(bundle.practice, bundle.exam, bundle.pacing);

  return (
    <>
      <SiteNav />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-16">
        <header className="flex flex-col gap-1">
          <h1 className="text-4xl font-medium tracking-tight">Your stats</h1>
          <p className="text-sm text-muted-foreground">
            Every practice set and practice test, in one place — trends, weak skills, and AI-generated recommendations.
          </p>
        </header>
        <StatsClient bundle={bundle} insights={insights} />
      </div>
    </>
  );
}
