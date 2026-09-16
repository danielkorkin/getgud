"use client";

import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";

export function SprInput({
  value,
  onChange,
  disabled,
  isCorrect,
  correctAnswer,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  isCorrect: boolean | null;
  correctAnswer: readonly string[];
}) {
  const revealed = isCorrect !== null;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-muted-foreground" htmlFor="spr-response">
        Enter your answer
      </label>
      <div className="flex items-center gap-2">
        <Input
          id="spr-response"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. 14.5 or 29/2"
          className={cn(
            "max-w-48 font-mono",
            revealed && isCorrect && "border-tag-green-foreground/40 bg-tag-green",
            revealed && !isCorrect && "border-tag-red-foreground/40 bg-tag-red",
          )}
        />
        {revealed &&
          (isCorrect ? (
            <CheckCircleIcon weight="fill" className="size-4 text-tag-green-foreground" />
          ) : (
            <XCircleIcon weight="fill" className="size-4 text-tag-red-foreground" />
          ))}
      </div>
      {revealed && correctAnswer.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Accepted answer{correctAnswer.length > 1 ? "s" : ""}:{" "}
          <span className="font-mono text-foreground">{correctAnswer.join(", ")}</span>
        </p>
      )}
    </div>
  );
}
