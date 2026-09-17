"use client";

import { useEffect, useState } from "react";

function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * A live mm:ss readout. `baseMs` is prior elapsed time (e.g. from a previous
 * session); it keeps ticking from `since`.
 *
 * Pass `frozenMs` once the question has been answered — the same
 * `Attempt.totalMs` the server already recomputed and saved on submit — and
 * the display locks there instead of continuing to count while the student
 * reads the rationale or chats with the coach. The interval is skipped
 * entirely while frozen, not just visually clamped.
 */
export function LiveTimer({
  since,
  baseMs = 0,
  frozenMs = null,
  className,
}: {
  since: number;
  baseMs?: number;
  frozenMs?: number | null;
  className?: string;
}) {
  const [now, setNow] = useState(since);

  useEffect(() => {
    if (frozenMs != null) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [frozenMs]);

  const ms = frozenMs != null ? frozenMs : baseMs + Math.max(0, now - since);
  return <span className={className}>{formatMs(ms)}</span>;
}
