"use client";

// Count + sort live here, above the results list, rather than buried at the
// bottom of the filter sidebar — same navigate-and-reset-page-1 pattern as
// problem-filters.tsx's `navigate`, duplicated rather than shared (it's four
// lines and the two callers change independently).

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { browseParamsToQuery, type BrowseFilters, type BrowseSort } from "@/lib/query/browse-filters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SORT_OPTIONS: { value: BrowseSort; label: string }[] = [
  { value: "skill", label: "Section, domain, skill" },
  { value: "difficulty_asc", label: "Difficulty: easy to hard" },
  { value: "difficulty_desc", label: "Difficulty: hard to easy" },
  { value: "band_asc", label: "Score band: low to high" },
  { value: "band_desc", label: "Score band: high to low" },
];

export function ResultsToolbar({ filters, resultCount }: { filters: BrowseFilters; resultCount: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // "similarity" is a real BrowseFilters.sort value while ?similar=<id> is
  // set (browse-filters.ts's parseBrowseParams defaults to it), but it's
  // meaningless without a source question — only offer it in that mode.
  const options = filters.similarTo ? [{ value: "similarity" as BrowseSort, label: "Most similar" }, ...SORT_OPTIONS] : SORT_OPTIONS;

  function navigate(sort: BrowseSort) {
    const next: BrowseFilters = { ...filters, sort, page: 1 };
    const qs = browseParamsToQuery(next);
    const setParam = searchParams.get("set");
    const url = setParam ? `/problems?${qs}&set=${encodeURIComponent(setParam)}` : `/problems?${qs}`;
    startTransition(() => router.replace(url));
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="font-mono text-sm text-muted-foreground">
        {resultCount} question{resultCount === 1 ? "" : "s"}
      </p>
      <Select value={filters.sort} onValueChange={(value) => navigate(value as BrowseSort)}>
        <SelectTrigger className="h-8 w-[220px] text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
