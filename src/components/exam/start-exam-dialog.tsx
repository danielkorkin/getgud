"use client";

import { useState, useTransition } from "react";
import { startExam } from "@/actions/exams";
import type { ExamSectionCode } from "@/exams/spec";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";

const SECTION_LABEL: Record<ExamSectionCode, string> = { RW: "Reading and Writing", MATH: "Math" };

export function StartExamDialog({
  examId,
  triggerLabel,
  disabled,
}: {
  examId: string;
  triggerLabel: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [firstSection, setFirstSection] = useState<ExamSectionCode>("RW");
  const [splitSitting, setSplitSitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleStart() {
    setError(null);
    const sectionOrder: [ExamSectionCode, ExamSectionCode] =
      firstSection === "RW" ? ["RW", "MATH"] : ["MATH", "RW"];
    startTransition(async () => {
      const result = await startExam(examId, { sectionOrder, splitSitting });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button disabled={disabled} />}>{triggerLabel}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start this test</DialogTitle>
          <DialogDescription>Choose how you&apos;d like to take it.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Which section first?</span>
            <RadioGroup value={firstSection} onValueChange={(value) => setFirstSection(value as ExamSectionCode)}>
              {(["RW", "MATH"] as const).map((code) => (
                <label key={code} className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value={code} />
                  {SECTION_LABEL[code]}
                </label>
              ))}
            </RadioGroup>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={splitSitting} onCheckedChange={(checked) => setSplitSitting(checked === true)} className="mt-0.5" />
            <span>
              Take one section now, and finish the other later
              <span className="mt-0.5 block text-xs text-muted-foreground">
                You&apos;ll see your first section&apos;s score right away, then can pick up the second whenever you&apos;re
                ready.
              </span>
            </span>
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button onClick={handleStart} disabled={pending}>
            {pending ? "Starting…" : "Start test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
