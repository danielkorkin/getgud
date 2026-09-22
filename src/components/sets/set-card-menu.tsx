"use client";

// Rename/delete controls for a /sets library card. Rendered as a sibling of
// the card's own <Link> (see src/app/sets/page.tsx), never nested inside
// it — a <button> inside an <a> is invalid HTML and would also make every
// click here also trigger the card's navigation.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSet, renameSet } from "@/actions/sets";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";

export function SetCardMenu({ setId, name }: { setId: string; name: string }) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openRename(open: boolean) {
    setRenameOpen(open);
    if (open) {
      setDraftName(name);
      setError(null);
    }
  }

  function openDelete(open: boolean) {
    setDeleteOpen(open);
    if (open) setError(null);
  }

  function handleRename() {
    setError(null);
    startTransition(async () => {
      const result = await renameSet(setId, draftName);
      if ("error" in result) setError(result.error);
      else {
        setRenameOpen(false);
        router.refresh();
      }
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteSet(setId);
      if ("error" in result) setError(result.error);
      else {
        setDeleteOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center gap-1">
      <Dialog open={renameOpen} onOpenChange={openRename}>
        <DialogTrigger
          render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Rename set" />}
        >
          <PencilSimpleIcon />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename set</DialogTitle>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={`rename-${setId}`}>Name</FieldLabel>
            <Input
              id={`rename-${setId}`}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={80}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleRename();
                }
              }}
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenameOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" onClick={handleRename} disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={openDelete}>
        <DialogTrigger
          render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Delete set" />}
        >
          <TrashIcon />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{name}&rdquo;?</DialogTitle>
            <DialogDescription>
              This permanently deletes the set and every answer, hint, and note attached to it. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={pending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
