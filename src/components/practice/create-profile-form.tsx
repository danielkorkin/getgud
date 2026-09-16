"use client";

import { useActionState } from "react";
import { createProfile, type CreateProfileState } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const initialState: CreateProfileState = { error: "" };

export function CreateProfileForm() {
  const [state, formAction, pending] = useActionState(createProfile, initialState);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <FieldGroup>
        <Field data-invalid={Boolean(state.error) || undefined}>
          <FieldLabel htmlFor="profile-name">Your name</FieldLabel>
          <Input
            id="profile-name"
            name="name"
            autoFocus
            autoComplete="off"
            placeholder="e.g. Alex"
            aria-invalid={Boolean(state.error) || undefined}
            maxLength={40}
          />
          <FieldDescription>
            No password — this just keeps your sets and results separate from anyone else using this
            install. Enter a name you&apos;ve used before to pick that profile back up.
          </FieldDescription>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={pending}>
        {pending ? "Starting…" : "Start practicing"}
      </Button>
    </form>
  );
}
