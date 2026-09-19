"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CoffeeIcon, ArrowRightIcon, ArrowLeftIcon } from "@phosphor-icons/react";
import { ExamCountdown } from "./exam-countdown";
import type { ExamSectionCode } from "@/exams/spec";

const SECTION_LABEL: Record<ExamSectionCode, string> = { RW: "Reading and Writing", MATH: "Math" };

/**
 * Per the user's decision: the break's own countdown does NOT start
 * automatically when the first section ends — only when the student
 * presses "Start break" here. Skippable at any point, before or during.
 *
 * `justFinishedSection`/`nextSection` come from the session's chosen
 * `sectionOrder` (see src/lib/exam/phases.ts) — this screen always shows
 * right after slot 2, so whichever section the student picked to go first
 * is always the one that "just finished" here, regardless of whether that
 * was RW or Math.
 */
export function ExamBreak({
  justFinishedSection,
  nextSection,
  justFinishedScore,
  splitSitting,
  breakStartedAt,
  breakEndsAt,
  serverNow,
  onStart,
  onSkip,
  pending,
}: {
  justFinishedSection: ExamSectionCode;
  nextSection: ExamSectionCode;
  justFinishedScore: number | null;
  splitSitting: boolean;
  breakStartedAt: string | null;
  breakEndsAt: string | null;
  serverNow: string;
  onStart: () => void;
  onSkip: () => void;
  pending: boolean;
}) {
  const started = Boolean(breakStartedAt && breakEndsAt);
  // ExamCountdown below only ever mounts once per break (its parent
  // <CardContent> appears the moment `started` flips true and never
  // unmounts after), so these start fresh with no reset effect needed.
  const autoSkippedRef = useRef(false);
  const [expired, setExpired] = useState(false);

  const justFinishedLabel = SECTION_LABEL[justFinishedSection];
  const nextLabel = SECTION_LABEL[nextSection];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <CoffeeIcon weight="fill" className="size-10 text-muted-foreground" />
        <h1 className="text-3xl font-medium tracking-tight">Break</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          You&apos;ve finished {justFinishedLabel}. Take a short break before starting {nextLabel} — or continue right away.
        </p>
      </div>

      {justFinishedScore != null && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-base">{justFinishedLabel} score</CardTitle>
            <CardDescription>Your scaled score for this section, ready now.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl font-medium">
              {justFinishedScore} <span className="text-base font-normal text-muted-foreground">/ 800</span>
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base">{started ? "Break in progress" : "10-minute break"}</CardTitle>
          <CardDescription>
            {started ? `Continue to ${nextLabel} whenever you're ready.` : "The countdown starts when you press Start."}
          </CardDescription>
        </CardHeader>
        {started && breakEndsAt && (
          <CardContent>
            <ExamCountdown
              deadlineAt={breakEndsAt}
              serverNow={serverNow}
              onExpire={() => {
                if (autoSkippedRef.current) return;
                autoSkippedRef.current = true;
                setExpired(true);
              }}
              className="justify-center text-2xl"
            />
          </CardContent>
        )}
      </Card>

      {splitSitting && (
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          You chose to take this test one section at a time — {nextLabel} isn&apos;t going anywhere. Come back for it
          whenever you&apos;re ready.
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        {!started && (
          <Button size="lg" variant="outline" onClick={onStart} disabled={pending}>
            Start break
          </Button>
        )}
        <Button size="lg" variant={splitSitting ? "outline" : "default"} onClick={onSkip} disabled={pending}>
          {expired ? "Time's up — continue" : `Continue to ${nextLabel}`}
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
        <Button size="lg" variant={splitSitting ? "default" : "outline"} render={<Link href="/tests" />} nativeButton={false}>
          <ArrowLeftIcon data-icon="inline-start" />
          Finish for now — I&apos;ll do {nextLabel} later
        </Button>
      </div>
    </div>
  );
}
