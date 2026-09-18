// The Learn half's landing page.
//
// Structured around the test's own domains rather than around resource
// types, because a student arrives here from a results page knowing "I'm
// bad at Transitions", not knowing "I want a video". The resource-type view
// lives at /learn/resources for when that is what you want.
//
// Renders with no database access and no profile requirement: unlike every
// page in the Practice half, this one works on a fresh clone before
// `pnpm scrape` has run. That's deliberate — see src/resources/spec.ts's
// header comment on why the shelf is committed code.

import Link from "next/link";
import { DOMAINS, SECTIONS } from "@/lib/catalog";
import { FEATURED_GUIDES, FEATURED_RESOURCES, GUIDES, RESOURCES, studyForDomain } from "@/resources";
import { GuideCard } from "@/components/learn/guide-card";
import { ResourceCard } from "@/components/learn/resource-card";
import { SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal } from "@/components/reveal";
import { ArrowRightIcon, StackIcon } from "@phosphor-icons/react/dist/ssr";

export const metadata = {
  title: "Learn — Getgud",
  description: "Guides, cheat sheets, and vetted SAT and PSAT resources.",
};

export default function LearnPage() {
  return (
    <>
      <SiteNav />
      <div className="isolate mx-auto flex w-full max-w-4xl flex-col gap-16 px-6 py-16">
        <div aria-hidden className="ambient-glow pointer-events-none fixed inset-0 -z-10" />

        <header className="flex flex-col gap-3">
          <span className="text-xs tracking-[0.05em] text-muted-foreground uppercase">Learn</span>
          <h1 className="text-4xl font-medium tracking-tight">Tips, tricks, and courses</h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            {GUIDES.length} guides written for this app, plus {RESOURCES.length} hand-checked links to the best
            courses, channels, and official material for the SAT and PSAT. Every link here was verified to resolve
            — nothing is recommended from memory.
          </p>
        </header>

        <Reveal index={0}>
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-medium tracking-tight">Start here</h2>
              <Button variant="ghost" size="sm" render={<Link href="/learn/guides" />} nativeButton={false}>
                All guides
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FEATURED_GUIDES.map((guide) => (
                <GuideCard key={guide.id} guide={guide} />
              ))}
            </div>
          </section>
        </Reveal>

        {SECTIONS.map((section, sectionIndex) => {
          const domains = DOMAINS.filter((d) => d.sectionCode === section.code);
          return (
            <Reveal key={section.code} index={sectionIndex + 1}>
              <section className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <h2 className="text-xl font-medium tracking-tight">{section.label}</h2>
                  <p className="text-sm text-muted-foreground">
                    {domains.length} domains · {domains.reduce((n, d) => n + d.skills.length, 0)} skills
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {domains.map((domain) => {
                    const { guides, resources } = studyForDomain(domain.code);
                    return (
                      <Link key={domain.code} href={`/learn/topics/${domain.code}`} className="block">
                        <Card interactive>
                          <CardHeader>
                            <CardTitle className="text-base leading-snug">{domain.label}</CardTitle>
                            <CardDescription>
                              {domain.skills.length} skills · {guides.length}{" "}
                              {guides.length === 1 ? "guide" : "guides"} · {resources.length} resources
                            </CardDescription>
                          </CardHeader>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </section>
            </Reveal>
          );
        })}

        <Reveal index={3}>
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-medium tracking-tight">Featured resources</h2>
              <Button variant="ghost" size="sm" render={<Link href="/learn/resources" />} nativeButton={false}>
                <StackIcon data-icon="inline-start" />
                Browse all
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FEATURED_RESOURCES.map((resource) => (
                <ResourceCard key={resource.id} resource={resource} />
              ))}
            </div>
          </section>
        </Reveal>
      </div>
    </>
  );
}
