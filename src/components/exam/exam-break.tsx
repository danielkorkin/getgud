"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CoffeeIcon, ArrowRightIcon } from "@phosphor-icons/react";
import { ExamCountdown } from "./exam-countdown";

/**
 * Per the user's decision: the break's own countdown does NOT start
 * automatically when Reading & Writing ends — only when the student
 * presses "Start break" here. Skippable at any point, before or during.
 */
export function ExamBreak({
  breakStartedAt,
  breakEndsAt,
  serverNow,
  onStart,
  onSkip,
  pending,
}: {
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

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <CoffeeIcon weight="fill" className="size-10 text-muted-foreground" />
        <h1 className="font-serif text-3xl tracking-tight">Break</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          You&apos;ve finished Reading and Writing. Take a short break before starting Math — or continue right away.
        </p>
      </div>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base">{started ? "Break in progress" : "10-minute break"}</CardTitle>
          <CardDescription>
            {started ? "Continue to Math whenever you're ready." : "The countdown starts when you press Start."}
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
      <div className="flex gap-3">
        {!started && (
          <Button size="lg" variant="outline" onClick={onStart} disabled={pending}>
            Start break
          </Button>
        )}
        <Button size="lg" onClick={onSkip} disabled={pending}>
          {expired ? "Time's up — continue" : "Continue to Math"}
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}
