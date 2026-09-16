"use client";

import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger, PopoverHeader, PopoverTitle } from "@/components/ui/popover";
import { FlagIcon, ListIcon } from "@phosphor-icons/react";

export interface NavItemState {
  position: number;
  status: "unanswered" | "answered" | "skipped";
  isCorrect: boolean | null;
  markedForReview: boolean;
}

export function QuestionNav({
  items,
  current,
  onJump,
}: {
  items: NavItemState[];
  current: number;
  onJump: (position: number) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <ListIcon data-icon="inline-start" />
        Question {current + 1} of {items.length}
      </PopoverTrigger>
      <PopoverContent className="w-80" side="top">
        <PopoverHeader>
          <PopoverTitle>Jump to a question</PopoverTitle>
        </PopoverHeader>
        <div className="grid grid-cols-6 gap-1.5">
          {items.map((item) => (
            <button
              key={item.position}
              type="button"
              onClick={() => onJump(item.position)}
              className={cn(
                "relative flex h-8 w-full items-center justify-center rounded-md border text-xs font-medium transition-colors",
                item.position === current
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border hover:bg-muted",
                item.status === "answered" && item.isCorrect === true && "bg-tag-green text-tag-green-foreground",
                item.status === "answered" && item.isCorrect === false && "bg-tag-red text-tag-red-foreground",
                item.status === "answered" && item.isCorrect === null && "bg-muted",
              )}
            >
              {item.position + 1}
              {item.markedForReview && (
                <FlagIcon weight="fill" className="absolute -top-1.5 -right-1.5 size-3 text-tag-yellow-foreground" />
              )}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground">
          <Legend swatch="bg-tag-green" label="Correct" />
          <Legend swatch="bg-tag-red" label="Incorrect" />
          <Legend swatch="bg-muted" label="Answered" />
          <Legend swatch="border border-border" label="Unanswered" />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-sm", swatch)} />
      {label}
    </span>
  );
}
