"use client";

import { useState } from "react";
import Link from "next/link";
import { AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChoiceList } from "@/components/practice/choice-list";
import type { ProblemRowData } from "./types";
import { CheckIcon, PlusIcon, SparkleIcon, CopySimpleIcon } from "@phosphor-icons/react";

const DIFFICULTY_VARIANT = { E: "tag-green", M: "tag-yellow", H: "tag-red" } as const;

/**
 * One compact status slot instead of three competing badges — priority
 * order is "blocks an action" (ungradable) > "you've seen this" > "has a
 * figure", since only one of these is ever worth a glance in the collapsed
 * row.
 */
function rowStatus(row: ProblemRowData): { label: string; className: string } | null {
  if (!row.gradable) return { label: "No answer on file", className: "text-muted-foreground" };
  if (row.answeredCount > 0) {
    return row.correctCount > 0
      ? { label: "Seen · got it", className: "text-tag-green-foreground" }
      : { label: "Seen · missed", className: "text-tag-red-foreground" };
  }
  if (row.hasEmbeddedMathImages) return { label: "Figure", className: "text-muted-foreground" };
  return null;
}

export function ProblemRow({
  row,
  selected,
  onToggleSelect,
  hasActiveSet,
  inActiveSet,
  onAdd,
  adding,
}: {
  row: ProblemRowData;
  selected: boolean;
  onToggleSelect: (checked: boolean) => void;
  hasActiveSet: boolean;
  inActiveSet: boolean;
  onAdd: () => void;
  adding: boolean;
}) {
  const status = rowStatus(row);

  return (
    <AccordionItem value={row.questionId}>
      {/*
        The bulk-select checkbox is a SIBLING of AccordionTrigger, never a
        child of it. AccordionTrigger (src/components/ui/accordion.tsx)
        bakes in a real <button>, and Base UI's Checkbox renders one too —
        nesting them is invalid HTML (a button inside a button) that React
        warns about, and stopPropagation doesn't fix the semantics. The
        wrapper <div> below is needed because AccordionTrigger's className
        lands on the Trigger itself, not on the fixed `Header
        className="flex"` it's wrapped in.

        The checkbox itself only renders once a set is active — with
        nothing to add to, bulk-select is a dead control, not a feature.
      */}
      <div className="flex items-center gap-2">
        {hasActiveSet && (
          <Checkbox
            checked={selected}
            disabled={!row.gradable}
            onCheckedChange={onToggleSelect}
            aria-label={`Select question ${row.externalId ?? row.ibn ?? row.questionId}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <AccordionTrigger>
            <div className="flex flex-1 flex-wrap items-center gap-2 pr-2 text-sm font-normal">
              <Badge variant={DIFFICULTY_VARIANT[row.difficulty]}>{row.difficulty}</Badge>
              <span className="min-w-0 flex-1 truncate text-left">
                {row.domainLabel} — {row.skillLabel}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {row.sectionCode} · {row.type === "mcq" ? "MCQ" : "SPR"}
              </span>
              {row.similarityRank !== null && (
                <span className="shrink-0 font-mono text-xs text-muted-foreground">#{row.similarityRank}</span>
              )}
              {row.sameTemplate && (
                <CopySimpleIcon
                  className="size-3.5 shrink-0 text-muted-foreground"
                  role="img"
                  aria-label="Same template as source question"
                />
              )}
              {status && <span className={`shrink-0 text-xs ${status.className}`}>{status.label}</span>}
            </div>
          </AccordionTrigger>
        </div>
      </div>
      <AccordionContent>
        <ProblemRowBody row={row} hasActiveSet={hasActiveSet} inActiveSet={inActiveSet} onAdd={onAdd} adding={adding} />
      </AccordionContent>
    </AccordionItem>
  );
}

function ProblemRowBody({
  row,
  hasActiveSet,
  inActiveSet,
  onAdd,
  adding,
}: {
  row: ProblemRowData;
  hasActiveSet: boolean;
  inActiveSet: boolean;
  onAdd: () => void;
  adding: boolean;
}) {
  // Local to this panel, not to ProblemRow/AccordionItem — Base UI's
  // Accordion.Panel unmounts when closed (keepMounted defaults false), so
  // collapsing the row resets `revealed` for free with no onOpenChange
  // wiring needed.
  const [revealed, setRevealed] = useState(false);

  const addLabel = !row.gradable ? "No answer on file" : inActiveSet ? "Added" : adding ? "Adding…" : "Add to set";
  const addDisabled = !row.gradable || inActiveSet || !hasActiveSet || adding;

  return (
    <div className="flex flex-col gap-4 pb-4">
      {row.stimulusHtml && (
        <div
          className="rounded-lg border border-border p-4 text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: row.stimulusHtml }}
        />
      )}
      <div
        className="text-base leading-relaxed [&_.katex]:text-[1.05em]"
        dangerouslySetInnerHTML={{ __html: row.stemHtml }}
      />

      {row.type === "mcq" ? (
        <ChoiceList
          options={row.options ?? []}
          selectedOptionId={null}
          eliminatedOptionIds={[]}
          disabled
          correctOptionId={revealed ? row.correctOptionId : null}
          eliminatorMode={false}
          onSelect={() => {}}
          onToggleEliminate={() => {}}
        />
      ) : revealed ? (
        <div className="rounded-lg border border-tag-green-foreground/40 bg-tag-green p-3 text-sm">
          <p className="text-muted-foreground">Accepted answer{row.correctAnswer.length > 1 ? "s" : ""}:</p>
          <p className="font-mono">{row.correctAnswer.length > 0 ? row.correctAnswer.join(", ") : "—"}</p>
        </div>
      ) : null}

      {revealed && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm font-medium">Rationale</p>
          <div
            className="text-sm leading-relaxed text-muted-foreground [&_.katex]:text-foreground"
            dangerouslySetInnerHTML={{ __html: row.rationaleHtml }}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setRevealed((v) => !v)}>
          {revealed ? "Hide answer" : "Show answer"}
        </Button>
        {hasActiveSet && (
          <Button type="button" variant={inActiveSet ? "secondary" : "default"} size="sm" onClick={onAdd} disabled={addDisabled}>
            {inActiveSet ? <CheckIcon data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
            {addLabel}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          render={<Link href={row.similarHref} />}
          nativeButton={false}
        >
          <SparkleIcon data-icon="inline-start" />
          View similar
        </Button>
        <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">{row.externalId ?? row.ibn}</span>
      </div>
    </div>
  );
}
