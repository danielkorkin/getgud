// Every in-app guide, grouped by what it applies to.
//
// Whole-test guides come first because they apply to everyone regardless of
// which section they're weak in; section-specific ones follow. Ordering
// within each group comes from the registry's own array order (see
// ALL_GUIDES in src/resources/index.ts), which is reading order, not
// alphabetical.

import { GUIDES } from "@/resources";
import { SECTIONS } from "@/lib/catalog";
import { GuideCard } from "@/components/learn/guide-card";
import { SiteNav } from "@/components/site-nav";
import { Reveal } from "@/components/reveal";

export const metadata = {
  title: "Guides — Getgud",
  description: "Cheat sheets and strategy guides written for Getgud.",
};

export default function GuidesPage() {
  const wholeTest = GUIDES.filter((g) => !g.sectionCode);
  const totalMinutes = GUIDES.reduce((n, g) => n + g.minutes, 0);

  return (
    <>
      <SiteNav />
      <div className="isolate mx-auto flex w-full max-w-4xl flex-col gap-12 px-6 py-16">
        <div aria-hidden className="ambient-glow pointer-events-none fixed inset-0 -z-10" />

        <header className="flex flex-col gap-3">
          <span className="text-xs tracking-[0.05em] text-muted-foreground uppercase">Learn</span>
          <h1 className="font-serif text-4xl tracking-tight">Guides</h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            {GUIDES.length} guides, {totalMinutes} minutes of reading in total. Written for this app rather than
            linked from elsewhere, so they work offline and stay consistent with how the practice tool scores and
            times you.
          </p>
        </header>

        {wholeTest.length > 0 && (
          <Reveal index={0}>
            <section className="flex flex-col gap-4">
              <h2 className="font-serif text-xl tracking-tight">The whole test</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {wholeTest.map((guide) => (
                  <GuideCard key={guide.id} guide={guide} />
                ))}
              </div>
            </section>
          </Reveal>
        )}

        {SECTIONS.map((section, i) => {
          const guides = GUIDES.filter((g) => g.sectionCode === section.code);
          if (guides.length === 0) return null;
          return (
            <Reveal key={section.code} index={i + 1}>
              <section className="flex flex-col gap-4">
                <h2 className="font-serif text-xl tracking-tight">{section.label}</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {guides.map((guide) => (
                    <GuideCard key={guide.id} guide={guide} />
                  ))}
                </div>
              </section>
            </Reveal>
          );
        })}
      </div>
    </>
  );
}
