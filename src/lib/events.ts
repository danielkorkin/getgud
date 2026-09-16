// Client-side telemetry buffer. Plain class, no React — the runner wires
// it up with its own effects (flush on interval / navigation / unmount).
// Batches to POST /api/events on: ~10s interval, question navigation, and
// `pagehide` via `navigator.sendBeacon` (which needs no fetch/await and
// survives the page actually unloading).

import type { EventType } from "@/lib/event-types";

export interface QueuedEvent {
  seq: number;
  type: EventType;
  atMs: number;
  clientAt: string;
  payload?: unknown;
}

const FLUSH_INTERVAL_MS = 10_000;

export class EventBuffer {
  private queue: QueuedEvent[] = [];
  private nextSeq = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private setId: string,
    private attemptId: string,
    private questionId: string,
  ) {}

  /** Re-point the buffer at a new question — flushes whatever was queued for the old one first. */
  retarget(attemptId: string, questionId: string): void {
    void this.flush();
    this.attemptId = attemptId;
    this.questionId = questionId;
    this.nextSeq = 0;
  }

  record(type: EventType, atMs: number, payload?: unknown): void {
    this.queue.push({ seq: this.nextSeq++, type, atMs, clientAt: new Date().toISOString(), payload });
  }

  startAutoFlush(): void {
    this.stopAutoFlush();
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
  }

  stopAutoFlush(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private body(events: QueuedEvent[]): string {
    return JSON.stringify({ setId: this.setId, attemptId: this.attemptId, questionId: this.questionId, events });
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    try {
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: this.body(batch),
        keepalive: true,
      });
    } catch {
      // Best-effort — telemetry, not the practice flow. Drop rather than
      // grow unboundedly if the network is down for a whole session.
    }
  }

  /** Synchronous, fire-and-forget — call from a `pagehide` handler only. */
  flushBeacon(): void {
    if (this.queue.length === 0) return;
    if (typeof navigator === "undefined" || !navigator.sendBeacon) return;
    const batch = this.queue;
    this.queue = [];
    navigator.sendBeacon("/api/events", new Blob([this.body(batch)], { type: "application/json" }));
  }
}

/** Accumulates ms only while the tab is visible and focused — walking away doesn't pollute timing. */
export class ActiveTimeTracker {
  private activeMs = 0;
  private lastResumeAt: number | null = null;

  constructor() {
    if (typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus()) {
      this.lastResumeAt = performance.now();
    }
  }

  private isActiveNow(): boolean {
    return document.visibilityState === "visible" && document.hasFocus();
  }

  resume(): void {
    if (this.lastResumeAt === null && this.isActiveNow()) this.lastResumeAt = performance.now();
  }

  pause(): void {
    if (this.lastResumeAt !== null) {
      this.activeMs += performance.now() - this.lastResumeAt;
      this.lastResumeAt = null;
    }
  }

  /** Current total, accounting for an in-progress active span. */
  elapsedMs(): number {
    if (this.lastResumeAt === null) return this.activeMs;
    return this.activeMs + (performance.now() - this.lastResumeAt);
  }

  /** Snapshot the total and start a fresh span (e.g. moving to the next question). */
  reset(): number {
    const total = Math.round(this.elapsedMs());
    this.activeMs = 0;
    this.lastResumeAt = this.isActiveNow() ? performance.now() : null;
    return total;
  }
}
