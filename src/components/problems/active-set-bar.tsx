"use client";

import { useState } from "react";
import Link from "next/link";
import { ASSESSMENTS } from "@/lib/catalog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { ActiveSet, DraftSetOption } from "./types";
import { ListIcon, PlayIcon, PlusIcon, XIcon } from "@phosphor-icons/react";

export function ActiveSetBar({
  activeSet,
  draftSets,
  selectedCount,
  pending,
  error,
  onCreateSet,
  onSelectDraft,
  onClearActive,
  onBulkAdd,
  onRemove,
}: {
  activeSet: ActiveSet | null;
  draftSets: DraftSetOption[];
  selectedCount: number;
  pending: boolean;
  error: string | null;
  onCreateSet: (name: string, assessment: string) => void;
  onSelectDraft: (setId: string) => void;
  onClearActive: () => void;
  onBulkAdd: () => void;
  onRemove: (questionId: string) => void;
}) {
  const [name, setName] = useState("");
  const [assessment, setAssessment] = useState<string>(ASSESSMENTS[0].value);

  // No active set yet: a single trigger rather than a standing form — the
  // resume-draft/new-set controls only need to exist once someone actually
  // wants to build a set, not on every browse session.
  if (!activeSet) {
    return (
      <div className="flex items-center justify-end">
        <Popover>
          <PopoverTrigger render={<Button type="button" variant="outline" size="sm" />}>
            <PlusIcon data-icon="inline-start" />
            Build a set
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <div className="flex flex-col gap-3">
              {draftSets.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Resume a draft</span>
                  <Select
                    value={null}
                    onValueChange={(id) => {
                      if (typeof id === "string" && id) onSelectDraft(id);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pick a draft…" />
                    </SelectTrigger>
                    <SelectContent>
                      {draftSets.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name} · {d.questionCount}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">New set name</span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Weekend drill"
                  maxLength={80}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Test</span>
                <Select value={assessment} onValueChange={(v) => setAssessment(v as string)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSESSMENTS.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" size="sm" onClick={() => onCreateSet(name, assessment)} disabled={pending}>
                Create empty set
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <Card className="sticky top-4 z-10 bg-popover/95 shadow-sm backdrop-blur-sm">
      <CardContent className="flex flex-col gap-3 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{activeSet.name}</span>
            <span className="text-xs text-muted-foreground">
              {activeSet.questionCount} question{activeSet.questionCount === 1 ? "" : "s"} · {activeSet.assessment}
            </span>
          </div>

          {selectedCount > 0 && (
            <Button type="button" variant="secondary" size="sm" onClick={onBulkAdd} disabled={pending}>
              Add {selectedCount} selected
            </Button>
          )}

          <Sheet>
            <SheetTrigger
              render={<Button type="button" variant="outline" size="sm" disabled={activeSet.questionCount === 0} />}
            >
              <ListIcon data-icon="inline-start" />
              Review picks
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>{activeSet.name}</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-2 overflow-y-auto px-4">
                {activeSet.items.length === 0 && <p className="text-sm text-muted-foreground">No questions yet.</p>}
                {activeSet.items.map((item) => (
                  <div
                    key={item.questionId}
                    className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">
                        {item.domainLabel} — {item.skillLabel}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.sectionCode} · {item.difficulty}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onRemove(item.questionId)}
                      disabled={pending}
                      aria-label="Remove from set"
                    >
                      <XIcon />
                    </Button>
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>

          <Button
            type="button"
            size="sm"
            disabled={activeSet.questionCount === 0}
            render={<Link href={`/sets/${activeSet.id}`} />}
            nativeButton={false}
          >
            <PlayIcon data-icon="inline-start" />
            Take set
          </Button>

          <Button type="button" variant="ghost" size="sm" onClick={onClearActive}>
            Done
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
