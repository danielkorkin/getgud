// The full resource shelf. Thin server wrapper — the filtering UI is a
// client component, and the list it filters is committed code handed
// straight over (see resource-directory.tsx on why that's fine).

import { RESOURCES } from "@/resources";
import { ResourceDirectory } from "@/components/learn/resource-directory";
import { SiteNav } from "@/components/site-nav";

export const metadata = {
  title: "Resources — Getgud",
  description: "Hand-checked SAT and PSAT courses, channels, tools, and official material.",
};

export default function ResourcesPage() {
  const freeCount = RESOURCES.filter((r) => r.cost === "free" || r.cost === "free-account").length;

  return (
    <>
      <SiteNav />
      <div className="isolate mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-16">
        <div aria-hidden className="ambient-glow pointer-events-none fixed inset-0 -z-10" />

        <header className="flex flex-col gap-3">
          <span className="text-xs tracking-[0.05em] text-muted-foreground uppercase">Learn</span>
          <h1 className="font-serif text-4xl tracking-tight">Resources</h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            {RESOURCES.length} resources, {freeCount} of them free. Each one was checked by fetching its URL rather
            than recalling it, and each carries the date that check happened — link rot is the main way a list like
            this decays.
          </p>
        </header>

        <ResourceDirectory resources={RESOURCES} />
      </div>
    </>
  );
}
