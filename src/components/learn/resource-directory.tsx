"use client";

// The filterable resource shelf.
//
// Filtering is client-side over the full list, which is the right call here
// precisely because the list is committed code: it's a few dozen entries
// handed over in the RSC payload, so there is nothing to fetch and no
// server round-trip per keystroke. If this shelf ever grows into the
// hundreds, move the filtering server-side rather than adding
// virtualization.
//
// Filter idiom deliberately mirrors set-builder-form.tsx — same
// ToggleGroup usage, same "never let the user select zero options" guard —
// so the two halves of the site filter the same way. Note `multiple` on
// every multi-select group: Base UI's ToggleGroup is single-select by
// default, and omitting it silently collapses the group to one item per
// click (CLAUDE.md documents this).

import { useMemo, useState } from "react";
import { ResourceCard } from "@/components/learn/resource-card";
import { KIND_LABEL } from "@/components/learn/labels";
import { Field, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Resource, ResourceKind, TestTarget } from "@/resources";

const TESTS: readonly TestTarget[] = ["SAT", "PSAT"];

// Ordered by how people actually browse — the things you work through
// first, then the things you consult.
const KIND_ORDER: readonly ResourceKind[] = [
  "course",
  "practice",
  "video-channel",
  "article",
  "reference",
  "tool",
  "book",
  "community",
  "playlist",
];

function ResourceDirectory({ resources }: { resources: readonly Resource[] }) {
  const [query, setQuery] = useState("");
  const [tests, setTests] = useState<TestTarget[]>([...TESTS]);
  const [kinds, setKinds] = useState<ResourceKind[]>([]);
  const [freeOnly, setFreeOnly] = useState(false);

  const availableKinds = useMemo(
    () => KIND_ORDER.filter((kind) => resources.some((r) => r.kind === kind)),
    [resources],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return resources.filter((r) => {
      if (!r.tests.some((t) => tests.includes(t))) return false;
      // An empty `kinds` means "no kind filter", not "nothing matches" —
      // the alternative (defaulting to every kind selected) makes the
      // control look like it's filtering when it isn't.
      if (kinds.length > 0 && !kinds.includes(r.kind)) return false;
      if (freeOnly && r.cost !== "free" && r.cost !== "free-account") return false;
      if (needle === "") return true;
      return (
        r.title.toLowerCase().includes(needle) ||
        r.provider.toLowerCase().includes(needle) ||
        r.summary.toLowerCase().includes(needle)
      );
    });
  }, [resources, query, tests, kinds, freeOnly]);

  const grouped = useMemo(() => {
    return KIND_ORDER.map((kind) => ({ kind, items: filtered.filter((r) => r.kind === kind) })).filter(
      (group) => group.items.length > 0,
    );
  }, [filtered]);

  const filtersActive = query.trim() !== "" || kinds.length > 0 || freeOnly || tests.length !== TESTS.length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5 rounded-xl border border-border p-5">
        <Field>
          <FieldLabel htmlFor="resource-search">Search</FieldLabel>
          <Input
            id="resource-search"
            type="search"
            placeholder="Title, provider, or what it's good for"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>

        <div className="flex flex-wrap gap-6">
          <Field className="w-fit">
            <FieldLabel>Test</FieldLabel>
            <ToggleGroup
              multiple
              size="sm"
              value={tests}
              onValueChange={(next) => {
                if (next.length > 0) setTests(next as TestTarget[]);
              }}
            >
              {TESTS.map((test) => (
                <ToggleGroupItem key={test} value={test}>
                  {test}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>

          <Field className="w-fit">
            <FieldLabel>Cost</FieldLabel>
            <ToggleGroup
              multiple
              size="sm"
              value={freeOnly ? ["free"] : []}
              onValueChange={(next) => setFreeOnly(next.includes("free"))}
            >
              <ToggleGroupItem value="free">Free only</ToggleGroupItem>
            </ToggleGroup>
          </Field>
        </div>

        <Field>
          <FieldLabel>Type</FieldLabel>
          <ToggleGroup
            multiple
            size="sm"
            className="flex-wrap"
            value={kinds}
            onValueChange={(next) => setKinds(next as ResourceKind[])}
          >
            {availableKinds.map((kind) => (
              <ToggleGroupItem key={kind} value={kind}>
                {KIND_LABEL[kind]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>

        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">
            {filtered.length} of {resources.length} resources
          </span>
          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setTests([...TESTS]);
                setKinds([]);
                setFreeOnly(false);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing matches those filters. Clear one and try again.
        </p>
      ) : (
        grouped.map((group) => (
          <section key={group.kind} className="flex flex-col gap-4">
            <h2 className="font-serif text-xl tracking-tight">{KIND_LABEL[group.kind]}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {group.items.map((resource) => (
                <ResourceCard key={resource.id} resource={resource} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

export { ResourceDirectory };
