"use client";

import { useEffect, useRef, useState } from "react";
import { offsetsFromRange, rangeFromOffsets } from "@/lib/highlight-offsets";

export type HighlightTarget = "stimulus" | "stem";

export interface HighlightSpan {
  target: HighlightTarget;
  start: number;
  end: number;
  text: string;
  createdAt: string;
}

function overlaps(a: HighlightSpan, start: number, end: number): boolean {
  return a.start < end && a.end > start;
}

/**
 * Renders `html` and lets the reader select text to highlight it, via the
 * CSS Custom Highlight API rather than wrapping selections in `<mark>` —
 * no DOM mutation under this `dangerouslySetInnerHTML` subtree. Selecting
 * a range that overlaps an existing highlight removes it instead of adding
 * a new one.
 *
 * A question's stimulus and stem are two independent text containers, but
 * `Attempt.highlights` stores both in one array — so every span carries a
 * `target` tag, and each instance only ever applies/registers the spans
 * that belong to its own `target`. Without that tag, a stem offset would
 * get replayed against the stimulus's (unrelated) text and vice versa.
 * The CSS Highlight API's registry is also global (`CSS.highlights`), so
 * each target gets its own registry key — otherwise the two instances
 * stomp each other's registration on every render.
 */
export function Highlightable({
  target,
  html,
  highlights,
  onAddHighlight,
  onRemoveHighlight,
  className,
}: {
  target: HighlightTarget;
  html: string;
  highlights: readonly HighlightSpan[];
  onAddHighlight: (span: HighlightSpan) => void;
  onRemoveHighlight: (span: HighlightSpan) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<{ x: number; y: number; start: number; end: number; text: string } | null>(
    null,
  );
  const own = highlights.filter((h) => h.target === target);
  const highlightName = `getgud-highlight-${target}`;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof CSS === "undefined" || !("highlights" in CSS)) return;
    const registry = new Highlight();
    for (const span of own) {
      const range = rangeFromOffsets(container, span.start, span.end);
      if (range) registry.add(range);
    }
    CSS.highlights.set(highlightName, registry);
    return () => {
      CSS.highlights.delete(highlightName);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlights, html, highlightName]);

  // A selection made elsewhere on the page (or simply clicking to deselect)
  // never fires this container's onMouseUp, so the floating button would
  // otherwise stay stuck open pointing at a range that's no longer selected.
  useEffect(() => {
    function onSelectionChange() {
      if (window.getSelection()?.isCollapsed) setPending(null);
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  function handleSelect() {
    const selection = window.getSelection();
    const container = containerRef.current;
    if (!selection || selection.isCollapsed || !container || selection.rangeCount === 0) {
      setPending(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      setPending(null);
      return;
    }
    const text = selection.toString();
    if (!text.trim()) {
      setPending(null);
      return;
    }
    const { start, end } = offsetsFromRange(container, range);
    if (end <= start) {
      setPending(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    setPending({ x: rect.left + rect.width / 2, y: rect.top, start, end, text });
  }

  function handleConfirm() {
    if (!pending) return;
    const overlapping = own.find((h) => overlaps(h, pending.start, pending.end));
    if (overlapping) onRemoveHighlight(overlapping);
    else onAddHighlight({ target, start: pending.start, end: pending.end, text: pending.text, createdAt: new Date().toISOString() });
    setPending(null);
    window.getSelection()?.removeAllRanges();
  }

  const isRemoving = pending && own.some((h) => overlaps(h, pending.start, pending.end));

  return (
    <div className="relative">
      {/* Turbopack's build-time CSS parser doesn't yet recognize
          ::highlight() and fails the production build on it (even though
          every browser that implements the API parses it fine at
          runtime) — so this rule is injected here rather than living in
          globals.css. Reuses the tag-yellow spot color. */}
      <style>{`::highlight(${highlightName}) { background-color: var(--tag-yellow); color: var(--tag-yellow-foreground); }`}</style>
      <div
        ref={containerRef}
        className={className}
        onMouseUp={handleSelect}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {pending && (
        <button
          type="button"
          className="fixed z-50 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background shadow-md"
          style={{ left: pending.x, top: pending.y }}
          onClick={handleConfirm}
        >
          {isRemoving ? "Remove highlight" : "Highlight"}
        </button>
      )}
    </div>
  );
}
