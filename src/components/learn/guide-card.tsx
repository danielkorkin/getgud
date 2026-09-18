"use client";

// One in-app guide, as a card. The internal-link counterpart to
// ResourceCard — same shape and spacing so a mixed grid of "read this here"
// and "read this elsewhere" doesn't look like two different systems.
//
// `"use client"` for the same reason as ResourceCard: the bare
// `@phosphor-icons/react` import below is client-only and crashes a Server
// Component build. Every current consumer is a server page, so /dist/ssr
// would also work today — but these two cards are a matched pair and
// keeping them on the same footing means moving one into a client context
// later can't break it.

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClockIcon } from "@phosphor-icons/react";
import { GUIDE_KIND_LABEL } from "@/components/learn/labels";
import type { Guide } from "@/resources";

function GuideCard({ guide }: { guide: Guide }) {
  return (
    <Link href={`/learn/guides/${guide.id}`} className="block h-full">
      <Card interactive className="h-full">
        <CardHeader>
          <CardTitle className="text-base leading-snug">{guide.title}</CardTitle>
          <CardDescription className="flex items-center gap-1.5">
            <ClockIcon className="size-3.5" />
            {guide.minutes} min read
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-muted-foreground">{guide.summary}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="tag-blue">{GUIDE_KIND_LABEL[guide.kind]}</Badge>
            <Badge variant="outline">Written for Getgud</Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export { GuideCard };
