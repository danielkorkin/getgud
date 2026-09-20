"use client";

// The /problems filter panel. Deliberately holds almost no local filter
// state of its own — `filters` is the server-resolved BrowseFilters prop
// (parseBrowseParams already ran section -> domain -> skill resolution
// server-side), so every control here just toggles membership in one of
// its arrays and pushes the result straight to the URL via router.replace.
// The one genuinely local piece of state is the search text box, which
// needs to debounce before navigating (typing shouldn't fire a navigation
// per keystroke); everything else navigates immediately on change.
//
// Changing sectionCodes resets domainCodes/skillCodes to `[]` — which
// parseBrowseParams (src/lib/query/browse-filters.ts) reads as "all,
// resolved against the new sections" — rather than trying to carry over a
// domain/skill selection that may no longer even be valid for the new
// sections.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { browseParamsToQuery, type AttemptedFilter, type BrowseFilters } from "@/lib/query/browse-filters";
import {
  ASSESSMENTS,
  SECTIONS,
  DIFFICULTIES,
  QUESTION_TYPES,
  SCORE_BANDS,
  domainsForSection,
  type Assessment,
  type SectionCode,
  type Difficulty,
  type QuestionType,
} from "@/lib/catalog";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CaretDownIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";

const ATTEMPTED_OPTIONS: { value: AttemptedFilter; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "unattempted", label: "Not yet attempted" },
  { value: "attempted", label: "Already attempted" },
  { value: "incorrect", label: "Got wrong before" },
];

// catalog.ts's labels are the official, full-length names used on /new's
// wide single-column builder — "Fill-in (student-produced response)" alone
// is wider than this sidebar's whole 280px column. Shortened just for this
// narrow toggle-group display; the full name stays the accessible name via
// `aria-label` below, and the underlying value/code is unchanged.
const SHORT_ASSESSMENT_LABEL: Record<string, string> = { "PSAT/NMSQT & PSAT 10": "PSAT" };
const SHORT_TYPE_LABEL: Record<string, string> = { spr: "Fill-in" };

export function ProblemFilters({
  filters,
  pinnedAssessment,
}: {
  filters: BrowseFilters;
  pinnedAssessment: Assessment | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(filters.search);
  const requestId = useRef(0);

  function navigate(overrides: Partial<BrowseFilters>) {
    const next: BrowseFilters = { ...filters, ...overrides, page: 1 };
    const qs = browseParamsToQuery(next);
    // Preserve the active-set context across a filter change — it's not
    // part of BrowseFilters, so browseParamsToQuery never emits it.
    const setParam = searchParams.get("set");
    const url = setParam ? `/problems?${qs}&set=${encodeURIComponent(setParam)}` : `/problems?${qs}`;
    startTransition(() => router.replace(url));
  }

  useEffect(() => {
    if (search === filters.search) return;
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      if (requestId.current !== id) return;
      navigate({ search });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const availableDomains = filters.sectionCodes.flatMap((s) => domainsForSection(s));

  return (
    // `min-w-0` matters: this is a CSS grid item (the 280px track in
    // page.tsx's `lg:grid-cols-[280px_1fr]`), and a grid item's default
    // min-width is `auto` — its own intrinsic min-content width, not the
    // track size. Without it, a nowrap child (any ToggleGroup below) can
    // force the whole column wider than 280px, overlapping the results
    // pane next to it rather than wrapping or clipping.
    <div className={`flex min-w-0 flex-col gap-6 transition-opacity ${pending ? "opacity-60" : ""}`}>
      <Field>
        <FieldLabel htmlFor="problem-search" className="sr-only">
          Search stems
        </FieldLabel>
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="problem-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search question text…"
            className="pl-8"
          />
        </div>
      </Field>

      <FieldGroup>
        <Field>
          <FieldLabel>
            Test
            {pinnedAssessment && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">(pinned by the active set)</span>
            )}
          </FieldLabel>
          <ToggleGroup
            className="flex-wrap"
            value={[pinnedAssessment ?? filters.assessment]}
            disabled={pinnedAssessment !== null}
            onValueChange={(next) => {
              if (next[0] && !pinnedAssessment) navigate({ assessment: next[0] as Assessment });
            }}
          >
            {ASSESSMENTS.map((a) => (
              <ToggleGroupItem key={a.value} value={a.value} aria-label={a.label}>
                {SHORT_ASSESSMENT_LABEL[a.value] ?? a.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>

        <Field>
          <FieldLabel>Section</FieldLabel>
          <ToggleGroup
            multiple
            className="flex-wrap"
            value={filters.sectionCodes}
            onValueChange={(next) => {
              if (next.length > 0) navigate({ sectionCodes: next as SectionCode[], domainCodes: [], skillCodes: [] });
            }}
          >
            {SECTIONS.map((s) => (
              <ToggleGroupItem key={s.code} value={s.code}>
                {s.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>

        <Field>
          <FieldLabel>Difficulty</FieldLabel>
          <ToggleGroup
            multiple
            className="flex-wrap"
            value={filters.difficulties}
            onValueChange={(next) => {
              if (next.length > 0) navigate({ difficulties: next as Difficulty[] });
            }}
          >
            {DIFFICULTIES.map((d) => (
              <ToggleGroupItem key={d.code} value={d.code}>
                {d.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>

        <Field>
          <FieldLabel>Type</FieldLabel>
          <ToggleGroup
            multiple
            className="flex-wrap"
            value={filters.types}
            onValueChange={(next) => {
              if (next.length > 0) navigate({ types: next as QuestionType[] });
            }}
          >
            {QUESTION_TYPES.map((t) => (
              <ToggleGroupItem key={t.code} value={t.code} aria-label={t.label}>
                {SHORT_TYPE_LABEL[t.code] ?? t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      </FieldGroup>

      <FieldSet>
        <FieldLegend variant="label">Topics</FieldLegend>
        <Accordion multiple>
          {availableDomains.map((domain) => {
            const domainChecked = filters.domainCodes.includes(domain.code);
            const selectedSkillCount = domain.skills.filter((s) => filters.skillCodes.includes(s.code)).length;
            return (
              <AccordionItem key={domain.code} value={domain.code}>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={domainChecked}
                    onCheckedChange={(checked) => {
                      const domainCodes = checked
                        ? [...filters.domainCodes, domain.code]
                        : filters.domainCodes.filter((c) => c !== domain.code);
                      navigate({ domainCodes });
                    }}
                    aria-label={`Include ${domain.label}`}
                  />
                  <AccordionTrigger className="flex-1">
                    <span className="flex items-center gap-2">
                      {domain.label}
                      <span className="text-xs text-muted-foreground">
                        {selectedSkillCount}/{domain.skills.length}
                      </span>
                    </span>
                  </AccordionTrigger>
                </div>
                <AccordionContent>
                  <div className="flex flex-col gap-2 pl-8">
                    {domain.skills.map((skill) => {
                      const skillChecked = domainChecked && filters.skillCodes.includes(skill.code);
                      return (
                        <label key={skill.code} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={skillChecked}
                            disabled={!domainChecked}
                            onCheckedChange={(checked) => {
                              const skillCodes = checked
                                ? [...filters.skillCodes, skill.code]
                                : filters.skillCodes.filter((c) => c !== skill.code);
                              navigate({ skillCodes });
                            }}
                          />
                          {skill.label}
                        </label>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </FieldSet>

      <Collapsible>
        <CollapsibleTrigger className="group flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <CaretDownIcon className="size-4 transition-transform group-aria-expanded:rotate-180" />
          Advanced
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-6 pt-4">
          <Field>
            <FieldLabel>Score band</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {SCORE_BANDS.map((band) => {
                const checked = filters.scoreBands.includes(band);
                return (
                  <button
                    key={band}
                    type="button"
                    onClick={() => {
                      const scoreBands = checked
                        ? filters.scoreBands.filter((b) => b !== band)
                        : [...filters.scoreBands, band];
                      if (scoreBands.length > 0) navigate({ scoreBands });
                    }}
                    className={`h-7 w-7 rounded-md border text-xs font-medium transition-colors ${
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {band}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field>
            <FieldLabel>Attempt status</FieldLabel>
            <Select value={filters.attempted} onValueChange={(value) => navigate({ attempted: value as AttemptedFilter })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ATTEMPTED_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
