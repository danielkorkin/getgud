"use client";

import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger, PopoverHeader, PopoverTitle } from "@/components/ui/popover";
import { FlagIcon, ListIcon } from "@phosphor-icons/react";

/**
 * Exam-mode equivalent of src/components/practice/question-nav.tsx — a
 * DELIBERATELY separate component, not a shared prop. The practice one
 * colors cells green/red by `isCorrect`, which would leak the correct
 * answer mid-exam; this one only ever shows answered/unanswered/flagged.
 */
export interface ExamNavItemState {
  position: number;
  numberInModule: number;
  answered: boolean;
  markedForReview: boolean;
}

export function ExamQuestionNav({
  items,
  current,
  onJump,
  onOpenReview,
}: {
  items: ExamNavItemState[];
  current: number;
  onJump: (position: number) => void;
  onOpenReview: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <ListIcon data-icon="inline-start" />
        Question {items.find((i) => i.position === current)?.numberInModule ?? 1} of {items.length}
      </PopoverTrigger>
      <PopoverContent className="w-80" side="top">
        <PopoverHeader>
          <PopoverTitle>Questions in this module</PopoverTitle>
        </PopoverHeader>
        <div className="grid grid-cols-6 gap-1.5">
          {items.map((item) => (
            <button
              key={item.position}
              type="button"
              onClick={() => onJump(item.position)}
              className={cn(
                "relative flex h-8 w-full items-center justify-center rounded-md border text-xs font-medium transition-colors",
                item.position === current ? "border-primary ring-2 ring-primary/30" : "border-border hover:bg-muted",
                item.answered && "bg-muted",
              )}
            >
              {item.numberInModule}
              {item.markedForReview && (
                <FlagIcon weight="fill" className="absolute -top-1.5 -right-1.5 size-3 text-tag-yellow-foreground" />
              )}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground">
          <Legend swatch="bg-muted" label="Answered" />
          <Legend swatch="border border-border" label="Unanswered" />
          <Legend swatch="" label="Marked" icon />
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={onOpenReview}>
          Review page
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function Legend({ swatch, label, icon }: { swatch: string; label: string; icon?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      {icon ? (
        <FlagIcon weight="fill" className="size-3 text-tag-yellow-foreground" />
      ) : (
        <span className={cn("size-2.5 rounded-sm", swatch)} />
      )}
      {label}
    </span>
  );
}
