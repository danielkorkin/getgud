"use client";

import { cn } from "cn";
import { CheckCircleIcon, XCircleIcon, ProhibitIcon } from "@phosphor-icons/react";

export interface Choice {
  id: string;
  letter: string;
  html: string;
}

export function ChoiceList({
  options,
  selectedOptionId,
  eliminatedOptionIds,
  disabled,
  correctOptionId,
  eliminatorMode,
  onSelect,
  onToggleEliminate,
}: {
  options: Choice[];
  selectedOptionId: string | null;
  eliminatedOptionIds: readonly string[];
  disabled: boolean;
  correctOptionId: string | null;
  eliminatorMode: boolean;
  onSelect: (optionId: string) => void;
  onToggleEliminate: (optionId: string) => void;
}) {
  const revealed = correctOptionId !== null;

  return (
    <div className="flex flex-col gap-2.5" role="radiogroup">
      {options.map((option) => {
        const isSelected = option.id === selectedOptionId;
        const isEliminated = eliminatedOptionIds.includes(option.id);
        const isCorrect = revealed && option.id === correctOptionId;
        const isWrongSelected = revealed && isSelected && option.id !== correctOptionId;

        return (
          <div key={option.id} className="flex items-center gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled || isEliminated}
              onClick={() => onSelect(option.id)}
              className={cn(
                "group flex flex-1 items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors",
                "border-border hover:border-foreground/20 hover:bg-muted/50",
                isSelected && !revealed && "border-primary bg-primary/5 ring-1 ring-primary/30",
                isCorrect && "border-tag-green-foreground/40 bg-tag-green",
                isWrongSelected && "border-tag-red-foreground/40 bg-tag-red",
                isEliminated && "opacity-40",
                (disabled || isEliminated) && "cursor-default hover:border-border hover:bg-transparent",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                  isSelected && !revealed && "border-primary bg-primary text-primary-foreground",
                  isCorrect && "border-transparent bg-tag-green-foreground/20 text-tag-green-foreground",
                  isWrongSelected && "border-transparent bg-tag-red-foreground/20 text-tag-red-foreground",
                  !isSelected && !isCorrect && !isWrongSelected && "border-border text-muted-foreground",
                )}
              >
                {option.letter}
              </span>
              <span
                className={cn("flex-1 [&_p]:inline", isEliminated && "line-through")}
                dangerouslySetInnerHTML={{ __html: option.html }}
              />
              {isCorrect && (
                <CheckCircleIcon weight="fill" className="mt-0.5 size-4 shrink-0 text-tag-green-foreground" />
              )}
              {isWrongSelected && (
                <XCircleIcon weight="fill" className="mt-0.5 size-4 shrink-0 text-tag-red-foreground" />
              )}
            </button>
            {!disabled && eliminatorMode && (
              <button
                type="button"
                aria-label={isEliminated ? `Restore choice ${option.letter}` : `Eliminate choice ${option.letter}`}
                onClick={() => onToggleEliminate(option.id)}
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  isEliminated && "text-foreground",
                )}
              >
                <ProhibitIcon className={cn("size-4", isEliminated && "text-destructive")} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
