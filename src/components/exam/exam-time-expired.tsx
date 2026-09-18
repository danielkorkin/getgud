"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HourglassIcon, ArrowRightIcon } from "@phosphor-icons/react";

/**
 * Rendered when a reload lands on an *_active phase whose deadline has
 * already passed (see isModuleExpired in src/lib/exam/state.ts) — this is
 * the "tab was closed" expiry path. The countdown-driven "tab was open"
 * path calls submitModule directly without this interstitial; both funnel
 * into the same idempotent action.
 */
export function ExamTimeExpired({ onContinue, pending }: { onContinue: () => void; pending: boolean }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <HourglassIcon weight="fill" className="size-10 text-muted-foreground" />
        <h1 className="text-3xl font-medium tracking-tight">Time&apos;s up</h1>
      </div>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base">This module has ended</CardTitle>
          <CardDescription>
            Your answers have been saved. Continue to submit this module and move on — you won&apos;t be able to
            return to it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="lg" onClick={onContinue} disabled={pending} className="w-full">
            Continue
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
