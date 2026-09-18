// One guide.
//
// Statically generated: guides are committed source, so the full set is
// known at build time and there is nothing per-request about them. This
// also means a typo'd guide id 404s at build rather than at runtime.

import Link from "next/link";
import { notFound } from "next/navigation";
import { GUIDES, getGuide, getResource } from "@/resources";
import { domainLabel, skillLabel } from "@/lib/catalog";
import { GuideBody } from "@/components/learn/guide-body";
import { GUIDE_KIND_LABEL } from "@/components/learn/labels";
import { ResourceCard } from "@/components/learn/resource-card";
import { SiteNav } from "@/components/site-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeftIcon, ClockIcon } from "@phosphor-icons/react/dist/ssr";

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ id: guide.id }));
}

export async function generateMetadata({ params }: PageProps<"/learn/guides/[id]">) {
  const { id } = await params;
  const guide = getGuide(id);
  if (!guide) return { title: "Guide not found — Getgud" };
  return { title: `${guide.title} — Getgud`, description: guide.summary };
}

export default async function GuidePage({ params }: PageProps<"/learn/guides/[id]">) {
  const { id } = await params;
  const guide = getGuide(id);
  if (!guide) notFound();

  // Validated at module load to exist (see assertRegistryInvariants), so
  // the filter is a type narrowing rather than a real guard.
  const related = (guide.related ?? []).map(getResource).filter((r): r is NonNullable<typeof r> => r !== null);

  const domains = [...new Set(guide.domainCodes ?? [])];
  const skills = [...new Set(guide.skillCodes ?? [])];

  return (
    <>
      <SiteNav />
      <div className="isolate mx-auto flex w-full max-w-3xl flex-col gap-12 px-6 py-16">
        <div aria-hidden className="ambient-glow pointer-events-none fixed inset-0 -z-10" />

        <header className="flex flex-col gap-4">
          <Button variant="ghost" size="sm" className="self-start" render={<Link href="/learn/guides" />} nativeButton={false}>
            <ArrowLeftIcon data-icon="inline-start" />
            All guides
          </Button>
          <div className="flex flex-col gap-3">
            <span className="text-xs tracking-[0.05em] text-muted-foreground uppercase">
              {GUIDE_KIND_LABEL[guide.kind]}
            </span>
            <h1 className="text-4xl font-medium leading-[1.1] tracking-tight">{guide.title}</h1>
            <p className="text-base leading-relaxed text-muted-foreground">{guide.summary}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="gap-1">
              <ClockIcon />
              {guide.minutes} min
            </Badge>
            {guide.tests.map((test) => (
              <Badge key={test} variant="ghost">
                {test}
              </Badge>
            ))}
            {domains.map((code) => (
              <Badge key={code} variant="secondary" render={<Link href={`/learn/topics/${code}`} />}>
                {domainLabel(code)}
              </Badge>
            ))}
          </div>
        </header>

        <Separator />

        <GuideBody sections={guide.sections} />

        {skills.length > 0 && (
          <>
            <Separator />
            <section className="flex flex-col gap-3">
              <h2 className="text-xl font-medium tracking-tight">Skills this covers</h2>
              <p className="text-sm text-muted-foreground">
                The same skill names the practice tool reports on your results screen.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((code) => (
                  <Badge key={code} variant="outline">
                    {skillLabel(code)}
                  </Badge>
                ))}
              </div>
            </section>
          </>
        )}

        {related.length > 0 && (
          <>
            <Separator />
            <section className="flex flex-col gap-4">
              <h2 className="text-xl font-medium tracking-tight">Go deeper</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {related.map((resource) => (
                  <ResourceCard key={resource.id} resource={resource} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}
