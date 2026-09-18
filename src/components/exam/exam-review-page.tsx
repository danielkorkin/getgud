"use client";

import { useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { FlagIcon, CheckCircleIcon, ArrowLeftIcon } from "@phosphor-icons/react";
import type { ExamNavItemState } from "./exam-question-nav";

export function ExamReviewPage({
  sectionCode,
  moduleIndex,
  items,
  onJump,
  onBack,
  onSubmit,
  submitting,
}: {
  sectionCode: "RW" | "MATH";
  moduleIndex: 1 | 2;
  items: ExamNavItemState[];
  onJump: (position: number) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const answeredCount = items.filter((i) => i.answered).length;
  const unanswered = items.filter((i) => !i.answered);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <span className="text-xs tracking-[0.05em] text-muted-foreground uppercase">
          {sectionCode === "RW" ? "Reading and Writing" : "Math"} — Module {moduleIndex}
        </span>
        <h1 className="text-3xl font-medium tracking-tight">Review your answers</h1>
        <p className="text-sm text-muted-foreground">
          {answeredCount} of {items.length} answered. Once you submit, you cannot return to this module.
        </p>
      </div>

      <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
        {items.map((item) => (
          <button
            key={item.position}
            type="button"
            onClick={() => onJump(item.position)}
            className={cn(
              "relative flex h-10 w-full items-center justify-center rounded-lg border text-sm font-medium transition-colors",
              "border-border hover:border-foreground/30",
              item.answered && "bg-muted",
            )}
          >
            {item.numberInModule}
            {item.markedForReview && (
              <FlagIcon weight="fill" className="absolute -top-1.5 -right-1.5 size-3.5 text-tag-yellow-foreground" />
            )}
            {item.answered && (
              <CheckCircleIcon weight="fill" className="absolute -bottom-1.5 -right-1.5 size-3.5 text-tag-green-foreground" />
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back to questions
        </Button>
        <Button size="lg" onClick={() => setConfirmOpen(true)} disabled={submitting}>
          Submit module
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit this module?</DialogTitle>
          </DialogHeader>
          <Card className="border-none shadow-none">
            <CardHeader className="px-0">
              <CardTitle className="text-base">
                {unanswered.length > 0 ? `${unanswered.length} question${unanswered.length === 1 ? "" : "s"} unanswered` : "All questions answered"}
              </CardTitle>
              <CardDescription>
                Once submitted, you cannot come back to this module. Your next module will be based on your
                performance here.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0" />
          </Card>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Keep working</DialogClose>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                onSubmit();
              }}
              disabled={submitting}
            >
              Submit module
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
