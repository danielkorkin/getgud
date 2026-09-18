"use client";

// One external resource, as a card.
//
// Rendered from both server pages (/learn, /learn/topics/[domain],
// /learn/guides/[id]) and the client-side filtered directory
// (/learn/resources), so that a resource looks identical wherever it
// appears.
//
// `"use client"` is load-bearing, not incidental. `@phosphor-icons/react`'s
// default export is client-only: importing it from a Server Component
// crashes the build with `(0, b.createContext) is not a function`
// (CLAUDE.md documents this). The alternatives were importing from
// /dist/ssr — which then breaks the moment the client directory imports
// this file — or keeping two near-identical card components. Marking the
// leaf as a client component is the one option that stays correct from
// both sides. There are no hooks here; the cost is the markup shipping in
// the client bundle, which for a presentational card is negligible.

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRightIcon } from "@phosphor-icons/react";
import { COST_LABEL, COST_VARIANT, KIND_LABEL } from "@/components/learn/labels";
import type { Resource } from "@/resources";

function ResourceCard({ resource }: { resource: Resource }) {
  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block h-full focus-visible:outline-none"
    >
      <Card interactive className="h-full">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">{resource.title}</CardTitle>
            <ArrowUpRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </div>
          <CardDescription>{resource.provider}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-muted-foreground">{resource.summary}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{KIND_LABEL[resource.kind]}</Badge>
            <Badge variant={COST_VARIANT[resource.cost]}>{COST_LABEL[resource.cost]}</Badge>
            {resource.tests.map((test) => (
              <Badge key={test} variant="ghost">
                {test}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </a>
  );
}

export { ResourceCard };
