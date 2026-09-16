"use client";

import { useEffect, useState } from "react";

function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** A live mm:ss readout. `baseMs` is prior elapsed time (e.g. from a previous session); it keeps ticking from `since`. */
export function LiveTimer({ since, baseMs = 0, className }: { since: number; baseMs?: number; className?: string }) {
  const [now, setNow] = useState(since);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  return <span className={className}>{formatMs(baseMs + Math.max(0, now - since))}</span>;
}
