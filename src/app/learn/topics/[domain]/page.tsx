// One domain's study page — the destination the results screen links to
// when a student's weakest skill belongs to this domain.
//
// Skill anchors (`#skill-<code>`) are what make that link land on the right
// place in the page rather than at the top. Skill codes contain dots
// ("H.A."), which are legal in an id attribute but need escaping in a CSS
// selector — that's fine here because nothing queries them from CSS or JS;
// they exist only as fragment targets.

import Link from "next/link";
import { notFound } from "next/navigation";
import { DOMAINS, domainLabel } from "@/lib/catalog";
import { studyForDomain, studyForSkill } from "@/resources";
import { GuideCard } from "@/components/learn/guide-card";
import { ResourceCard } from "@/components/learn/resource-card";
import { SiteNav } from "@/components/site-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Reveal } from "@/components/reveal";
import { ArrowLeftIcon, PlusIcon } from "@phosphor-icons/react/dist/ssr";

export function generateStaticParams() {
  return DOMAINS.map((domain) => ({ domain: domain.code }));
}

export async function generateMetadata({ params }: PageProps<"/learn/topics/[domain]">) {
  const { domain: code } = await params;
  const domain = DOMAINS.find((d) => d.code === code);
  if (!domain) return { title: "Topic not found — Getgud" };
  return {
    title: `${domain.label} — Getgud`,
    description: `Guides and resources for ${domain.label} on the SAT and PSAT.`,
  };
}

export default async function TopicPage({ params }: PageProps<"/learn/topics/[domain]">) {
  const { domain: code } = await params;
  const domain = DOMAINS.find((d) => d.code === code);
  if (!domain) notFound();

  const { guides, resources } = studyForDomain(domain.code);
  const sectionLabel = domain.sectionCode === "RW" ? "Reading and Writing" : "Math";

  return (
    <>
      <SiteNav />
      <div className="isolate mx-auto flex w-full max-w-4xl flex-col gap-12 px-6 py-16">
        <div aria-hidden className="ambient-glow pointer-events-none fixed inset-0 -z-10" />

        <header className="flex flex-col gap-4">
          <Button variant="ghost" size="sm" className="self-start" render={<Link href="/learn" />} nativeButton={false}>
            <ArrowLeftIcon data-icon="inline-start" />
            Learn
          </Button>
          <div className="flex flex-col gap-3">
            <span className="text-xs tracking-[0.05em] text-muted-foreground uppercase">{sectionLabel}</span>
            <h1 className="font-serif text-4xl tracking-tight">{domain.label}</h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              {domain.skills.length} skills the test reports separately. Practice questions in this app carry these
              same codes, so your results screen points back here.
            </p>
          </div>
          <Button variant="outline" size="sm" className="self-start" render={<Link href="/new" />} nativeButton={false}>
            <PlusIcon data-icon="inline-start" />
            Drill this domain
          </Button>
        </header>

        {guides.length > 0 && (
          <Reveal index={0}>
            <section className="flex flex-col gap-4">
              <h2 className="font-serif text-xl tracking-tight">Guides</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {guides.map((guide) => (
                  <GuideCard key={guide.id} guide={guide} />
                ))}
              </div>
            </section>
          </Reveal>
        )}

        <Reveal index={1}>
          <section className="flex flex-col gap-4">
            <h2 className="font-serif text-xl tracking-tight">Skills</h2>
            <div className="flex flex-col gap-3">
              {domain.skills.map((skill) => {
                const forSkill = studyForSkill(skill.code, domain.code);
                const specific = [
                  ...forSkill.guides.filter((g) => g.skillCodes?.includes(skill.code)),
                  ...forSkill.resources.filter((r) => r.skillCodes?.includes(skill.code)),
                ];
                return (
                  <div
                    key={skill.code}
                    id={`skill-${skill.code}`}
                    className="flex flex-col gap-2 rounded-xl border border-border p-4 scroll-mt-24"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium tracking-tight">{skill.label}</span>
                      <Badge variant="ghost" className="font-mono">
                        {skill.code}
                      </Badge>
                    </div>
                    {specific.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {forSkill.guides
                          .filter((g) => g.skillCodes?.includes(skill.code))
                          .map((g) => (
                            <Badge key={g.id} variant="tag-blue" render={<Link href={`/learn/guides/${g.id}`} />}>
                              {g.title}
                            </Badge>
                          ))}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Covered by the {domain.label} resources below.
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </Reveal>

        {resources.length > 0 && (
          <>
            <Separator />
            <Reveal index={2}>
              <section className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <h2 className="font-serif text-xl tracking-tight">Resources</h2>
                  <p className="text-sm text-muted-foreground">
                    Tagged to {domainLabel(domain.code)}. For the full shelf, see{" "}
                    <Link href="/learn/resources" className="underline underline-offset-4 hover:text-foreground">
                      all resources
                    </Link>
                    .
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {resources.map((resource) => (
                    <ResourceCard key={resource.id} resource={resource} />
                  ))}
                </div>
              </section>
            </Reveal>
          </>
        )}

        <p className="text-xs text-muted-foreground">
          Domain and skill names are College Board&apos;s own reporting categories, matching the codes the question
          bank carries — see ATTRIBUTION.md.
        </p>
      </div>
    </>
  );
}
