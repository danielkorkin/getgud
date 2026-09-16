"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { ChoiceList } from "@/components/practice/choice-list";
import { SprInput } from "@/components/practice/spr-input";
import { CheckCircleIcon, XCircleIcon, MinusCircleIcon, FlagIcon } from "@phosphor-icons/react";

export interface ExamReviewRow {
  position: number;
  numberInExam: number;
  sectionCode: "RW" | "MATH";
  domainLabel: string;
  skillLabel: string;
  markedForReview: boolean;
  activeMs: number;
  isCorrect: boolean | null;
  gradable: boolean;
  stimulusHtml: string | null;
  stemHtml: string;
  rationaleHtml: string;
  type: "mcq" | "spr";
  options: { id: string; letter: string; html: string }[] | null;
  selectedOptionId: string | null;
  correctOptionId: string | null;
  correctAnswer: readonly string[];
  spResponse: string | null;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Rationales appear HERE AND ONLY HERE — never during the exam itself.
 * Content is rendered fully server-side (renderContentField's LRU cache
 * makes this cheap for a completed 98-question test) and handed to the
 * Accordion purely for expand/collapse UI; Base UI's Accordion primitives
 * carry no "use client" boundary of their own, so this composes as an
 * ordinary server component with ChoiceList/SprInput as client leaves.
 */
export function ExamReviewAccordion({ rows }: { rows: ExamReviewRow[] }) {
  return (
    <Accordion>
      {rows.map((row) => (
        <AccordionItem key={row.position} value={String(row.position)}>
          <AccordionTrigger>
            <div className="flex flex-1 flex-wrap items-center gap-3 pr-2 text-sm font-normal">
              <span className="w-6 shrink-0 font-mono text-muted-foreground">{row.numberInExam}</span>
              {row.isCorrect === true && <CheckCircleIcon weight="fill" className="size-4 shrink-0 text-tag-green-foreground" />}
              {row.isCorrect === false && <XCircleIcon weight="fill" className="size-4 shrink-0 text-tag-red-foreground" />}
              {row.isCorrect === null && <MinusCircleIcon className="size-4 shrink-0 text-muted-foreground" />}
              <span className="flex-1 truncate text-left">
                {row.domainLabel} — {row.skillLabel}
              </span>
              {row.markedForReview && <FlagIcon weight="fill" className="size-4 shrink-0 text-tag-yellow-foreground" />}
              <Badge variant="secondary" className="shrink-0">
                {row.sectionCode}
              </Badge>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{formatDuration(row.activeMs)}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-4 pb-4">
              {row.stimulusHtml && (
                <div className="rounded-lg border border-border p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: row.stimulusHtml }} />
              )}
              <div className="text-base leading-relaxed [&_.katex]:text-[1.05em]" dangerouslySetInnerHTML={{ __html: row.stemHtml }} />
              {row.type === "mcq" ? (
                <ChoiceList
                  options={row.options ?? []}
                  selectedOptionId={row.selectedOptionId}
                  eliminatedOptionIds={[]}
                  disabled
                  correctOptionId={row.correctOptionId}
                  eliminatorMode={false}
                  onSelect={() => {}}
                  onToggleEliminate={() => {}}
                />
              ) : (
                <SprInput
                  value={row.spResponse ?? ""}
                  onChange={() => {}}
                  disabled
                  isCorrect={row.gradable ? row.isCorrect : null}
                  correctAnswer={row.correctAnswer}
                />
              )}
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm font-medium">
                  {row.isCorrect === true && <span className="text-tag-green-foreground">Correct</span>}
                  {row.isCorrect === false && <span className="text-tag-red-foreground">Incorrect</span>}
                  {row.isCorrect === null && <span className="text-muted-foreground">Not auto-gradable</span>}
                  {!row.gradable && row.isCorrect === null && <span className="text-muted-foreground"> — no answer on file</span>}
                </p>
                <div
                  className="text-sm leading-relaxed text-muted-foreground [&_.katex]:text-foreground"
                  dangerouslySetInnerHTML={{ __html: row.rationaleHtml }}
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
