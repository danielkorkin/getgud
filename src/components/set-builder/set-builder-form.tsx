"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createSet, createSmartSet, countMatching } from "@/actions/sets";
import type { RawSetFilters } from "@/lib/query/generate-set";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CaretDownIcon } from "@phosphor-icons/react";
import { SmartSelectPanel } from "@/components/set-builder/smart-select-panel";

export function SetBuilderForm({ smartAvailable = false }: { smartAvailable?: boolean }) {
  const [assessment, setAssessment] = useState<Assessment>(ASSESSMENTS[0].value);
  const [sectionCodes, setSectionCodes] = useState<SectionCode[]>(SECTIONS.map((s) => s.code));
  const [difficulties, setDifficulties] = useState<Difficulty[]>(DIFFICULTIES.map((d) => d.code));
  const [deselectedDomains, setDeselectedDomains] = useState<ReadonlySet<string>>(new Set());
  const [deselectedSkills, setDeselectedSkills] = useState<ReadonlySet<string>>(new Set());
  const [scoreBands, setScoreBands] = useState<number[]>([...SCORE_BANDS]);
  const [types, setTypes] = useState<QuestionType[]>(QUESTION_TYPES.map((t) => t.code));
  const [excludeAttempted, setExcludeAttempted] = useState(false);
  const [questionCount, setQuestionCount] = useState(10);
  const [name, setName] = useState("");
  const [resolvedCount, setResolvedCount] = useState<{ key: string; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Smart select state — kept separate from the plain "Build set" flow.
  // smartSelected is the source of truth for what gets built, but only
  // while smartSelectedKey still matches the current pool — derived below
  // (once poolKey exists), not cleared via an effect (same "derived, not
  // eagerly set" idiom as countLoading/count below, which avoids a
  // react-hooks/set-state-in-effect cascade).
  const [smartPrompt, setSmartPrompt] = useState("");
  const [smartSelected, setSmartSelected] = useState<ReadonlySet<string>>(new Set());
  const [smartSelectedKey, setSmartSelectedKey] = useState<string | null>(null);
  // How many picks the last search actually found (independent of how many
  // are currently checked) — needed to tell "no search has run, or it found
  // nothing" (fine to fall back to a plain random build) apart from "a
  // search found matches but the student unchecked all of them" (should
  // block the build, not silently build an unrelated random set instead).
  const [smartPicksCount, setSmartPicksCount] = useState(0);

  const availableDomains = useMemo(
    () => sectionCodes.flatMap((s) => domainsForSection(s)),
    [sectionCodes],
  );
  const domainCodes = useMemo(
    () => availableDomains.filter((d) => !deselectedDomains.has(d.code)).map((d) => d.code),
    [availableDomains, deselectedDomains],
  );
  const availableSkills = useMemo(
    () => availableDomains.filter((d) => domainCodes.includes(d.code)).flatMap((d) => d.skills),
    [availableDomains, domainCodes],
  );
  const skillCodes = useMemo(
    () => availableSkills.filter((s) => !deselectedSkills.has(s.code)).map((s) => s.code),
    [availableSkills, deselectedSkills],
  );

  const filters: RawSetFilters = {
    assessment,
    sectionCodes,
    difficulties,
    domainCodes,
    skillCodes,
    scoreBands,
    types,
    excludeAttempted,
    questionCount,
  };
  const filtersKey = JSON.stringify(filters);
  // Everything that changes the matching POOL, deliberately omitting
  // questionCount — used to invalidate Smart select's picks. filtersKey
  // above stays as-is for the live count effect below (it's supposed to
  // re-fetch when the length slider moves; the picks list isn't).
  //
  // Array fields are sorted before stringifying: a ToggleGroup's
  // onValueChange reports newly-selected values in click/toggle order, not
  // canonical order, so deselecting and reselecting the same difficulty (or
  // any other multi-select) can silently reorder its array — e.g.
  // ["E","M","H"] -> ["H","E","M"] — with the matching pool completely
  // unchanged. A plain JSON.stringify would treat that as a real filter
  // change and needlessly invalidate the picks; sorting first makes the key
  // reflect the actual SET of values, not the order they were clicked in.
  const poolKey = JSON.stringify(
    { ...filters, questionCount: undefined },
    (key, value) => (Array.isArray(value) ? [...value].sort() : value),
  );
  const effectiveSmartSelected = useMemo(
    () => (smartSelectedKey === poolKey ? smartSelected : new Set<string>()),
    [smartSelectedKey, poolKey, smartSelected],
  );
  const effectiveSmartPicksCount = smartSelectedKey === poolKey ? smartPicksCount : 0;

  // Derived, not eagerly set — the effect below only writes on actual
  // resolution, so there's no synchronous setState at the top of the
  // effect body (a rendering cascade react-hooks/set-state-in-effect
  // flags). Loading is simply "the resolved answer is for a stale key".
  const countLoading = resolvedCount?.key !== filtersKey;
  const count = countLoading ? null : resolvedCount!.count;

  const requestId = useRef(0);
  useEffect(() => {
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      const result = await countMatching(filters);
      if (requestId.current !== id) return; // a newer request superseded this one
      setResolvedCount({ key: filtersKey, count: "count" in result ? result.count : 0 });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);


  function toggleDomain(code: string, checked: boolean) {
    setDeselectedDomains((prev) => {
      const next = new Set(prev);
      if (checked) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleSkill(code: string, checked: boolean) {
    setDeselectedSkills((prev) => {
      const next = new Set(prev);
      if (checked) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  // Re-cap (never re-run) the current selection to the live question count —
  // moving the length slider down after a search shouldn't silently build a
  // larger set than the slider now shows.
  const cappedSmartSelected = useMemo(
    () => new Set([...effectiveSmartSelected].slice(0, questionCount)),
    [effectiveSmartSelected, questionCount],
  );

  // A search found genuine matches, but the student unchecked every one of
  // them — NOT the same thing as "no search has run" or "the search found
  // nothing" (both of which fall back to a plain random build below). This
  // case must block the build entirely rather than silently substituting an
  // unrelated random set for the one the student was reviewing.
  const smartAllDeselected = effectiveSmartPicksCount > 0 && cappedSmartSelected.size === 0;

  function handleSubmit() {
    if (smartAllDeselected) return; // belt-and-suspenders — the button is already disabled for this
    setError(null);
    startTransition(async () => {
      const result =
        cappedSmartSelected.size > 0
          ? await createSmartSet(filters, smartPrompt, [...cappedSmartSelected], name)
          : await createSet(filters, name);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <FieldGroup>
        <Field>
          <FieldLabel>Test</FieldLabel>
          <ToggleGroup
            value={[assessment]}
            onValueChange={(next) => {
              // Single-select (Base UI's ToggleGroup default) — an empty
              // `next` means the user clicked the already-selected item;
              // keep it selected rather than allowing zero assessments.
              if (next[0]) setAssessment(next[0] as Assessment);
            }}
          >
            {ASSESSMENTS.map((a) => (
              <ToggleGroupItem key={a.value} value={a.value}>
                {a.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>

        <Field>
          <FieldLabel>Section</FieldLabel>
          <ToggleGroup
            multiple
            value={sectionCodes}
            onValueChange={(next) => {
              if (next.length > 0) setSectionCodes(next as SectionCode[]);
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
            value={difficulties}
            onValueChange={(next) => {
              if (next.length > 0) setDifficulties(next as Difficulty[]);
            }}
          >
            {DIFFICULTIES.map((d) => (
              <ToggleGroupItem key={d.code} value={d.code}>
                {d.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      </FieldGroup>

      <FieldSet>
        <FieldLegend variant="label">Topics</FieldLegend>
        <FieldDescription>Everything&apos;s selected by default — narrow it down if you want.</FieldDescription>
        <Accordion multiple>
          {availableDomains.map((domain) => {
            const domainChecked = !deselectedDomains.has(domain.code);
            const selectedSkillCount = domain.skills.filter((s) => !deselectedSkills.has(s.code)).length;
            return (
              <AccordionItem key={domain.code} value={domain.code}>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={domainChecked}
                    onCheckedChange={(checked) => toggleDomain(domain.code, checked)}
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
                    {domain.skills.map((skill) => (
                      <label key={skill.code} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={domainChecked && !deselectedSkills.has(skill.code)}
                          disabled={!domainChecked}
                          onCheckedChange={(checked) => toggleSkill(skill.code, checked)}
                        />
                        {skill.label}
                      </label>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </FieldSet>

      {smartAvailable && (
        <SmartSelectPanel
          filters={filters}
          poolKey={poolKey}
          prompt={smartPrompt}
          onPromptChange={setSmartPrompt}
          onSelectionChange={(picks, selected) => {
            setSmartSelected(selected);
            setSmartSelectedKey(poolKey);
            setSmartPicksCount(picks.length);
          }}
        />
      )}

      <Collapsible>
        <CollapsibleTrigger className="group flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <CaretDownIcon className="size-4 transition-transform group-aria-expanded:rotate-180" />
          Advanced
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-6 pt-4">
          <Field>
            <FieldLabel>Question type</FieldLabel>
            <ToggleGroup
              multiple
              value={types}
              onValueChange={(next) => {
                if (next.length > 0) setTypes(next as QuestionType[]);
              }}
            >
              {QUESTION_TYPES.map((t) => (
                <ToggleGroupItem key={t.code} value={t.code}>
                  {t.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>

          <Field>
            <FieldLabel>Score band</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {SCORE_BANDS.map((band) => {
                const checked = scoreBands.includes(band);
                return (
                  <button
                    key={band}
                    type="button"
                    onClick={() =>
                      setScoreBands((prev) =>
                        checked ? prev.filter((b) => b !== band) : [...prev, band],
                      )
                    }
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

          <Field orientation="horizontal">
            <Checkbox
              id="exclude-attempted"
              checked={excludeAttempted}
              onCheckedChange={setExcludeAttempted}
            />
            <FieldLabel htmlFor="exclude-attempted" className="font-normal">
              Exclude questions I&apos;ve already attempted
            </FieldLabel>
          </Field>
        </CollapsibleContent>
      </Collapsible>

      <Field>
        <FieldLabel>
          Length — {questionCount} question{questionCount === 1 ? "" : "s"}
        </FieldLabel>
        <Slider
          value={[questionCount]}
          onValueChange={(v) => setQuestionCount(Array.isArray(v) ? v[0] : v)}
          min={1}
          max={50}
          step={1}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="set-name">Name (optional)</FieldLabel>
        <Input
          id="set-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Friday algebra drill"
          maxLength={80}
        />
      </Field>

      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-2xl">
            {cappedSmartSelected.size > 0 || smartAllDeselected
              ? cappedSmartSelected.size
              : countLoading
                ? "…"
                : (count ?? 0)}
          </CardTitle>
          <CardDescription>
            {smartAllDeselected ? (
              <span className="text-destructive">
                Check at least one smart match above, or clear the search to build a random set instead.
              </span>
            ) : cappedSmartSelected.size > 0 ? (
              "smart-selected question" + (cappedSmartSelected.size === 1 ? "" : "s") + " kept"
            ) : (
              <>
                matching question{count === 1 ? "" : "s"} in the bank
                {count !== null && count < questionCount && !countLoading && (
                  <span className="text-destructive"> — fewer than the {questionCount} requested</span>
                )}
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            onClick={handleSubmit}
            disabled={
              pending || smartAllDeselected || (cappedSmartSelected.size === 0 && (countLoading || (count ?? 0) === 0))
            }
          >
            {pending
              ? "Building…"
              : cappedSmartSelected.size > 0
                ? `Build set (${cappedSmartSelected.size})`
                : "Build set"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
