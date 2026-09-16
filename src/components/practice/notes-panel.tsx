"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function NotesPanel({
  notes,
  highlightCount,
  onChangeNotes,
  onClearHighlights,
}: {
  notes: string;
  highlightCount: number;
  onChangeNotes: (notes: string) => void;
  onClearHighlights: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {highlightCount} highlight{highlightCount === 1 ? "" : "s"}
        </span>
        {highlightCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onClearHighlights}>
            Clear all
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Select any text in the passage or question to highlight it.
      </p>
      <Textarea
        value={notes}
        onChange={(e) => onChangeNotes(e.target.value)}
        placeholder="Notes for this question…"
        className="min-h-40"
      />
    </div>
  );
}
