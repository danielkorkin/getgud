"use client";

// The one client component holding shared state between the active-set bar
// and the question rows — `selectedIds` (bulk-add) has to live above both,
// since the bar renders the "Add N selected" button and the rows render
// the checkboxes it counts. Every mutation calls `router.refresh()` on
// success rather than optimistically patching local state, so the
// server-computed `activeSet`/`draftSets` props (src/app/problems/page.tsx)
// stay the single source of truth — no risk of the client's idea of "what's
// in the set" drifting from what a later add/remove would actually see.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addQuestionsToSet, createEmptySet, removeQuestionFromSet } from "@/actions/sets";
import { Accordion } from "@/components/ui/accordion";
import { ProblemRow } from "./problem-row";
import { ActiveSetBar } from "./active-set-bar";
import type { ActiveSet, DraftSetOption, ProblemRowData } from "./types";

export function ProblemsBrowser({
  rows,
  activeSet,
  draftSets,
  filtersQuery,
  defaultOpenId = null,
}: {
  rows: ProblemRowData[];
  activeSet: ActiveSet | null;
  draftSets: DraftSetOption[];
  filtersQuery: string;
  /** A row to auto-expand on load — e.g. a "?question=<id>" deep link from
   *  Smart select (src/app/problems/page.tsx's `focusId`). Uncontrolled: the
   *  visitor can still collapse it or open others afterward. */
  defaultOpenId?: string | null;
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const activeQuestionIds = new Set(activeSet?.items.map((i) => i.questionId) ?? []);

  function toggleSelect(questionId: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(questionId);
      else next.delete(questionId);
      return next;
    });
  }

  /** Navigate keeping every current filter, only changing `?set=`. */
  function goToSet(setId: string | null) {
    const qs = setId ? `${filtersQuery}&set=${encodeURIComponent(setId)}` : filtersQuery;
    router.replace(`/problems?${qs}`);
  }

  function handleCreateSet(name: string, assessment: string) {
    setError(null);
    startTransition(async () => {
      const result = await createEmptySet(name, assessment);
      if ("error" in result) setError(result.error);
      else goToSet(result.setId);
    });
  }

  function handleAddOne(questionId: string) {
    if (!activeSet) return;
    setError(null);
    startTransition(async () => {
      const result = await addQuestionsToSet(activeSet.id, [questionId]);
      if ("error" in result) setError(result.error);
      else router.refresh();
    });
  }

  function handleBulkAdd() {
    if (!activeSet || selectedIds.size === 0) return;
    setError(null);
    const ids = [...selectedIds];
    startTransition(async () => {
      const result = await addQuestionsToSet(activeSet.id, ids);
      if ("error" in result) setError(result.error);
      else {
        setSelectedIds(new Set());
        router.refresh();
      }
    });
  }

  function handleRemove(questionId: string) {
    if (!activeSet) return;
    setError(null);
    startTransition(async () => {
      const result = await removeQuestionFromSet(activeSet.id, questionId);
      if ("error" in result) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ActiveSetBar
        activeSet={activeSet}
        draftSets={draftSets}
        selectedCount={selectedIds.size}
        pending={pending}
        error={error}
        onCreateSet={handleCreateSet}
        onSelectDraft={goToSet}
        onClearActive={() => {
          setSelectedIds(new Set());
          goToSet(null);
        }}
        onBulkAdd={handleBulkAdd}
        onRemove={handleRemove}
      />

      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No questions match these filters.</p>
      ) : (
        <Accordion multiple defaultValue={defaultOpenId ? [defaultOpenId] : undefined}>
          {rows.map((row) => (
            <ProblemRow
              key={row.questionId}
              row={row}
              selected={selectedIds.has(row.questionId)}
              onToggleSelect={(checked) => toggleSelect(row.questionId, checked)}
              hasActiveSet={activeSet !== null}
              inActiveSet={activeQuestionIds.has(row.questionId)}
              onAdd={() => handleAddOne(row.questionId)}
              adding={pending}
            />
          ))}
        </Accordion>
      )}
    </div>
  );
}
