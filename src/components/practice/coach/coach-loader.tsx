"use client";

// Small pixel-grid "thinking" indicator — adapted from the LoadingState
// primitive's Drive variant (chevron wavefront), remapped from its
// --ink/shadow-* token set onto this project's shadcn oklch tokens. The
// elapsed timer and Surfer/video variant aren't needed here — this is just
// the loader used inline while a hint/summary/chat reply streams in.
const CHEVRON_DELAYS = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3);
  const c = i % 3;
  return (c + Math.abs(r - 1)) * 90;
});

export function CoachLoader({ className }: { className?: string }) {
  return (
    <span aria-hidden className={`grid shrink-0 grid-cols-[repeat(3,4px)] gap-[1.5px] ${className ?? ""}`}>
      {CHEVRON_DELAYS.map((delay, index) => (
        <span
          key={index}
          className="coach-loader-dot size-[4px] rounded-[1px] bg-foreground"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
