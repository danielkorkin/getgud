"use client";

// The /problems library's own copy of Smart select (see
// src/components/set-builder/smart-select-panel.tsx) — a free-text prompt
// searched within whatever facet/text/attempted filters are already active
// on this page, via the same embeddings + LLM re-rank engine
// (smartSearchProblems -> smart-select.ts's shared smartSelectFromPool).
//
// A separate component rather than a shared one with the set-builder panel:
// the two "commit" actions are different enough (build a brand-new practice
// set vs. add matches to an already-active hand-picked one, or just browse
// them) that one component serving both would need more branching than
// reuse saves. The card markup and "open in the library" link are
// deliberately identical in spirit, though — this already IS the library,
// so that link opens the question in a fresh tab rather than navigating
// away from these very results.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addQuestionsToSet, smartSearchProblems } from "@/actions/sets";
import type { BrowseFilters } from "@/lib/query/browse-filters";
import type { SmartCandidate } from "@/lib/query/smart-select";
import type { ActiveSet } from "./types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { ArrowSquareOutIcon, PlusIcon, SparkleIcon } from "@phosphor-icons/react";

const DIFFICULTY_VARIANT = { E: "tag-green", M: "tag-yellow", H: "tag-red" } as const;

export interface SmartSearchPanelProps {
  filters: BrowseFilters;
  activeSet: ActiveSet | null;
}

export function SmartSearchPanel({ filters, activeSet }: SmartSearchPanelProps) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [picks, setPicks] = useState<SmartCandidate[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [adding, startAdd] = useTransition();

  const activeQuestionIds = new Set(activeSet?.items.map((i) => i.questionId) ?? []);

  function runSearch() {
    setError(null);
    setNote(null);
    startSearch(async () => {
      const result = await smartSearchProblems(filters, prompt);
      if ("error" in result) {
        setError(result.error);
        setPicks([]);
        setSelected(new Set());
        return;
      }
      // Ungradable picks and ones already in the active set start
      // unselected — addQuestionsToSet rejects a whole batch containing an
      // ungradable id, and re-adding an already-in-set id is a no-op the
      // student almost never wants ticked by default.
      const defaultSelected = result.picks.filter((p) => p.gradable && !activeQuestionIds.has(p.questionId));
      setPicks(result.picks);
      setSelected(new Set(defaultSelected.map((p) => p.questionId)));
      setNote(result.note || null);
    });
  }

  function toggle(questionId: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(questionId);
    else next.delete(questionId);
    setSelected(next);
  }

  function handleAdd() {
    if (!activeSet || selected.size === 0) return;
    setError(null);
    startAdd(async () => {
      const result = await addQuestionsToSet(activeSet.id, [...selected]);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  // Same query shape as every other "open this question in the library"
  // link (buildSimilarHref in src/app/problems/page.tsx, the set builder's
  // smart-select-panel.tsx) — pin assessment + section, then `question=<id>`
  // (browse-filters.ts's `focusId`) to land on that one question, expanded.
  function problemsHref(pick: SmartCandidate): string {
    const qs = new URLSearchParams({
      question: pick.questionId,
      assessment: filters.assessment,
      sections: pick.sectionCode,
    });
    const href = `/problems?${qs.toString()}`;
    // Carry the active set along, same as every other "open in library"
    // link (buildSimilarHref in src/app/problems/page.tsx) — without it,
    // the new tab this opens in would show no active-set bar at all, even
    // though the tab it was opened FROM has one.
    return activeSet ? `${href}&set=${encodeURIComponent(activeSet.id)}` : href;
  }

  const selectableCount = picks.filter((p) => p.gradable).length;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4">
      <Field>
        <FieldLabel htmlFor="smart-search-prompt" className="flex items-center gap-1.5">
          <SparkleIcon className="size-4" />
          Smart search
        </FieldLabel>
        <FieldDescription>
          Describe what you&apos;re looking for and the AI will search for questions matching it, within the
          filters on the left.
        </FieldDescription>
        <Textarea
          id="smart-search-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. semicolon joining two independent clauses"
          maxLength={500}
          rows={2}
        />
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={runSearch}
          disabled={searching || prompt.trim().length === 0}
        >
          {searching ? (
            <>
              <Spinner /> Searching…
            </>
          ) : (
            "Find questions"
          )}
        </Button>
      </Field>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {note && (
        <Alert>
          <AlertDescription>{note}</AlertDescription>
        </Alert>
      )}

      {picks.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Found {picks.length} question{picks.length === 1 ? "" : "s"}
            {activeSet && selectableCount > 0 ? ` — ${selected.size} selected` : ""}
          </p>
          <ul className="flex flex-col gap-2">
            {picks.map((p) => {
              const alreadyInSet = activeQuestionIds.has(p.questionId);
              return (
                <li key={p.questionId} className="flex items-start gap-2 rounded-lg border border-border bg-card p-2.5">
                  {activeSet && (
                    <Checkbox
                      checked={selected.has(p.questionId)}
                      disabled={!p.gradable || alreadyInSet}
                      onCheckedChange={(checked) => toggle(p.questionId, checked)}
                      aria-label={`Include question ranked #${p.rank}`}
                      className="mt-0.5"
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge variant={DIFFICULTY_VARIANT[p.difficulty as keyof typeof DIFFICULTY_VARIANT] ?? "outline"}>
                        {p.difficulty}
                      </Badge>
                      <span>
                        {p.sectionCode} · {p.skillCode}
                      </span>
                      {!p.gradable && <span className="text-muted-foreground">No answer on file</span>}
                      {alreadyInSet && <span className="text-muted-foreground">Already in set</span>}
                    </div>
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
              );
            })}
          </ul>
          {activeSet && (
            <Button
              type="button"
              size="sm"
              className="self-start"
              onClick={handleAdd}
              disabled={adding || selected.size === 0}
            >
              <PlusIcon data-icon="inline-start" />
              {adding ? "Adding…" : `Add ${selected.size} to ${activeSet.name}`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
