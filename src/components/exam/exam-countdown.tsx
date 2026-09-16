"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { ClockIcon } from "@phosphor-icons/react";

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Counts down to `deadlineAt` using the server's clock, not the browser's:
 * `serverNow` (an ISO timestamp from the same action response that
 * returned `deadlineAt`) is used to compute a `clientNow - serverNow` skew
 * offset inside an effect (never during render — `Date.now()` is impure and
 * must not run at render time); every tick subtracts that offset from
 * `Date.now()` before comparing to the deadline. Without this, a client
 * clock that's fast or slow either auto-submits early or shows time
 * remaining after the server has already started rejecting writes.
 *
 * Fires `onExpire` exactly once (guarded by a ref) when the countdown
 * reaches zero — never auto-submits itself; the caller decides what to do
 * (see exam-runner.tsx, which flushes pending saves before calling
 * submitModule).
 */
export function ExamCountdown({
  deadlineAt,
  serverNow,
  onExpire,
  hidden,
  className,
}: {
  deadlineAt: string;
  serverNow: string;
  onExpire: () => void;
  hidden?: boolean;
  className?: string;
}) {
  const offsetRef = useRef(0);
  const expiredRef = useRef(false);
  // null until the first effect tick runs (a render-time Date.now() call
  // would be impure) — renders as "--:--" for one frame at mount.
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    offsetRef.current = Date.now() - new Date(serverNow).getTime();
    expiredRef.current = false;
    const tick = () => {
      const serverAdjustedNow = Date.now() - offsetRef.current;
      const remaining = new Date(deadlineAt).getTime() - serverAdjustedNow;
      setRemainingMs(remaining);
      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineAt, serverNow]);

  const low = remainingMs !== null && remainingMs <= 5 * 60_000;

  return (
    <span
      className={cn(
        "flex items-center gap-1.5 font-mono text-sm tabular-nums",
        low && "text-tag-red-foreground",
        hidden && "invisible",
        className,
      )}
      aria-live="polite"
      aria-label={hidden || remainingMs === null ? undefined : `${formatRemaining(remainingMs)} remaining`}
    >
      <ClockIcon weight={low ? "fill" : "regular"} className="size-4" />
      {remainingMs === null ? "--:--" : formatRemaining(remainingMs)}
    </span>
  );
}
