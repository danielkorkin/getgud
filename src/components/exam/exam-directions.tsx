"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRightIcon } from "@phosphor-icons/react";

const SECTION_LABEL = { RW: "Reading and Writing", MATH: "Math" } as const;

export function ExamDirections({
  sectionCode,
  moduleIndex,
  minutes,
  itemCount,
  onContinue,
  pending,
}: {
  sectionCode: "RW" | "MATH";
  moduleIndex: 1 | 2;
  minutes: number;
  itemCount: number;
  onContinue: () => void;
  pending: boolean;
}) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-xs tracking-[0.05em] text-muted-foreground uppercase">
          {SECTION_LABEL[sectionCode]} — Module {moduleIndex}
        </span>
        <h1 className="font-serif text-3xl tracking-tight">Directions</h1>
      </div>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base">Before you begin</CardTitle>
          <CardDescription>
            {itemCount} questions · {minutes} minutes
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          {sectionCode === "RW" ? (
            <p>
              Each question is either based on a short passage or is stand-alone. Read each passage and question
              carefully, then choose the best answer from the four choices.
            </p>
          ) : (
            <p>
              You may use the calculator and reference sheet in the tool rail for any question. For
              student-produced response questions, enter your answer in the box provided.
            </p>
          )}
          <p>
            The timer starts as soon as you continue. You may move freely between questions within this module, mark
            questions for review, and revisit the review page before submitting — but once you submit this module,
            you cannot return to it.
          </p>
          {moduleIndex === 2 && (
            <p>The questions in this module were selected based on your performance on Module 1.</p>
          )}
        </CardContent>
      </Card>
      <Button size="lg" onClick={onContinue} disabled={pending}>
        Continue
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
    </div>
  );
}
