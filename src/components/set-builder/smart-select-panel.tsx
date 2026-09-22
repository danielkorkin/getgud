"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { smartSelect } from "@/actions/sets";
import type { RawSetFilters } from "@/lib/query/generate-set";
import type { SmartCandidate } from "@/lib/query/smart-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { ArrowSquareOutIcon, SparkleIcon } from "@phosphor-icons/react";

const DIFFICULTY_VARIANT = { E: "tag-green", M: "tag-yellow", H: "tag-red" } as const;

export interface SmartSelectPanelProps {
  filters: RawSetFilters;
  /** Cache key covering everything the search should be re-run for on
   *  change — the pool, NOT the length slider (see set-builder-form.tsx). */
  poolKey: string;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onSelectionChange: (picks: SmartCandidate[], selected: ReadonlySet<string>) => void;
}

export function SmartSelectPanel({ filters, poolKey, prompt, onPromptChange, onSelectionChange }: SmartSelectPanelProps) {
  const [searchedKey, setSearchedKey] = useState<string | null>(null);
  const [picks, setPicks] = useState<SmartCandidate[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The pool changed since the last search (a real filter, not just the
  // length slider) — the previous picks no longer describe what's actually
  // in scope, so surface that instead of silently keeping stale rows.
  const stale = searchedKey !== null && searchedKey !== poolKey && picks.length > 0;

  function runSearch() {
    setError(null);
    setNote(null);
    const thisKey = poolKey;
    startTransition(async () => {
      const result = await smartSelect(filters, prompt);
      if ("error" in result) {
        setError(result.error);
        setPicks([]);
        setSelected(new Set());
        onSelectionChange([], new Set());
        return;
      }
      const nextSelected = new Set(result.picks.map((p) => p.questionId));
      setPicks(result.picks);
      setSelected(nextSelected);
      setSearchedKey(thisKey);
      setNote(result.note || null);
      onSelectionChange(result.picks, nextSelected);
    });
  }

  // Same query shape as every other "open this question in the library"
  // link in the app (buildSimilarHref in src/app/problems/page.tsx,
  // practice-runner.tsx's "View similar problems") — pin assessment +
  // section so the row's own facets resolve correctly, then `question=<id>`
  // (browse-filters.ts's `focusId`) to land directly on that one question,
  // pre-expanded, rather than a filtered listing.
  function problemsHref(pick: SmartCandidate): string {
    const qs = new URLSearchParams({
      question: pick.questionId,
      assessment: filters.assessment,
      sections: pick.sectionCode,
    });
    return `/problems?${qs.toString()}`;
  }

  function toggle(questionId: string, checked: boolean) {
    // Compute the next set directly rather than inside setSelected's
    // updater — calling the parent's setState (via onSelectionChange) from
    // inside another component's state-updater function is exactly what
    // React's "Cannot update a component while rendering a different
    // component" guards against, even though it looks like a plain event
    // handler from the call site.
    const next = new Set(selected);
    if (checked) next.add(questionId);
    else next.delete(questionId);
    setSelected(next);
    onSelectionChange(picks, next);
  }

  return (
    <Field>
      <FieldLabel htmlFor="smart-select-prompt" className="flex items-center gap-1.5">
        <SparkleIcon className="size-4" />
        Smart select
      </FieldLabel>
      <FieldDescription>
        Describe what you&apos;re looking for and the AI will search for questions matching it, within the
        filters above.
      </FieldDescription>
      <Textarea
        id="smart-select-prompt"
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="e.g. passages that are poems with figurative language"
        maxLength={500}
        rows={2}
      />
      <Button
        type="button"
        variant="outline"
        onClick={runSearch}
        disabled={pending || prompt.trim().length === 0}
      >
        {pending ? (
          <>
            <Spinner /> Searching…
          </>
        ) : (
          "Find questions"
        )}
      </Button>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {stale && (
        <Alert>
          <AlertDescription>Your filters changed — search again to refresh these results.</AlertDescription>
        </Alert>
      )}

      {!stale && note && (
        <Alert>
          <AlertDescription>{note}</AlertDescription>
        </Alert>
      )}

      {!stale && picks.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Found {picks.length} question{picks.length === 1 ? "" : "s"} — {selected.size} selected
          </p>
          <ul className="flex flex-col gap-2">
            {picks.map((p) => (
              <li key={p.questionId} className="flex items-start gap-2 rounded-lg border border-border p-2.5">
                <Checkbox
                  checked={selected.has(p.questionId)}
                  onCheckedChange={(checked) => toggle(p.questionId, checked)}
                  aria-label={`Include question ranked #${p.rank}`}
                  className="mt-0.5"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant={DIFFICULTY_VARIANT[p.difficulty as keyof typeof DIFFICULTY_VARIANT] ?? "outline"}>
                      {p.difficulty}
                    </Badge>
                    <span>
                      {p.sectionCode} · {p.skillCode}
                    </span>
                  </div>
                  {/* Opens in a new tab, not the same one — /new carries a
                      lot of in-progress state (filters, prompt, other
                      picks) that navigating away would lose. */}
                  <Link
                    href={problemsHref(p)}
                    target="_blank"
                    className="group/open flex items-center gap-1 truncate text-sm hover:text-foreground hover:underline"
                    title="Open in the question bank"
                  >
                    <span className="min-w-0 truncate">{p.preview}</span>
                    <ArrowSquareOutIcon className="size-3.5 shrink-0 text-muted-foreground group-hover/open:text-foreground" />
                  </Link>
                  <p className="text-xs text-muted-foreground italic">{p.reason}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Field>
  );
}
