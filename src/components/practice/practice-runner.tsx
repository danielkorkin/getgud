"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "cn";
import {
  getRenderedItem,
  markVisited,
  submitAnswer,
  revealAnswer,
  toggleEliminateOption,
  toggleMarkForReview,
  saveAnnotations,
  recordToolUsage,
  recordTime,
  completeSet,
  type RenderedItemResult,
  type RevealedFeedback,
} from "@/actions/attempts";
import { EventBuffer, ActiveTimeTracker } from "@/lib/events";
import type { EventType } from "@/lib/event-types";
import type { CoachMessage } from "@/lib/ai/coach-prompt";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ToolRail, type DrawerView } from "@/components/practice/tool-rail";
import { QuestionNav, type NavItemState } from "@/components/practice/question-nav";
import { ChoiceList } from "@/components/practice/choice-list";
import { SprInput } from "@/components/practice/spr-input";
import { Highlightable, type HighlightSpan } from "@/components/practice/highlightable";
import { LiveTimer } from "@/components/practice/live-timer";
import { DesmosCalculator } from "@/components/practice/desmos-calculator";
import { ReferenceSheet } from "@/components/practice/reference-sheet";
import { Coach } from "@/components/practice/coach/coach";
import { NotesPanel } from "@/components/practice/notes-panel";
import { ArrowLeftIcon, ArrowRightIcon, CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";

const DIFFICULTY_VARIANT = { E: "tag-green", M: "tag-yellow", H: "tag-red" } as const;

type Feedback = RevealedFeedback & { isCorrect: boolean | null };

export function PracticeRunner({
  setId,
  setName,
  questionCount,
  startPosition,
  initialItems,
  hintsEnabled,
}: {
  setId: string;
  setName: string;
  questionCount: number;
  startPosition: number;
  initialItems: NavItemState[];
  hintsEnabled: boolean;
}) {
  const [position, setPosition] = useState(startPosition);
  const [items, setItems] = useState(initialItems);
  const [current, setCurrent] = useState<RenderedItemResult | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [sprResponse, setSprResponse] = useState("");
  const [eliminated, setEliminated] = useState<string[]>([]);
  const [markedForReview, setMarkedForReview] = useState(false);
  const [notes, setNotes] = useState("");
  const [highlights, setHighlights] = useState<HighlightSpan[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [usedHints, setUsedHints] = useState<{ level: number; content: string }[]>([]);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [correctStreak, setCorrectStreak] = useState(0);
  const [chatMessages, setChatMessages] = useState<CoachMessage[]>([]);
  /** Freezes the header timer's display the instant the question is answered — see `<LiveTimer frozenMs>`. Null while still unanswered. */
  const [answeredMs, setAnsweredMs] = useState<number | null>(null);
  const [activeDrawer, setActiveDrawer] = useState<DrawerView>(null);
  const [drawerWidth, setDrawerWidth] = useState(384);
  const [desmosMode, setDesmosMode] = useState<"graphing" | "scientific">("graphing");
  const [eliminatorMode, setEliminatorMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [questionStartedAt, setQuestionStartedAt] = useState(() => Date.now());

  const eventBufferRef = useRef<EventBuffer | null>(null);
  const activeTrackerRef = useRef<ActiveTimeTracker | null>(null);
  const afterFeedbackTrackerRef = useRef<ActiveTimeTracker | null>(null);
  const calculatorOpenedAtRef = useRef<number | null>(null);
  const prefetched = useRef<Map<number, RenderedItemResult>>(new Map());
  const notesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const elapsedSinceStart = useCallback(() => Date.now() - questionStartedAt, [questionStartedAt]);

  const flushTimers = useCallback(() => {
    const activeMs = activeTrackerRef.current?.reset() ?? 0;
    const afterMs = afterFeedbackTrackerRef.current?.reset() ?? 0;
    if (activeMs > 0 || afterMs > 0) {
      void recordTime(setId, position, { activeMs, afterFeedbackMs: afterMs });
    }
    void eventBufferRef.current?.flush();
  }, [setId, position]);

  // Load the current question — from the prefetch cache when available,
  // seeding every piece of local state from its Attempt row.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = prefetched.current.get(position);
      const result = cached ?? (await getRenderedItem(setId, position));
      if (cancelled) return;
      prefetched.current.delete(position);
      if (cached) void markVisited(setId, position);

      setCurrent(result);
      setSelectedOptionId(result.attempt.selectedOptionId);
      setSprResponse(result.attempt.spResponse ?? "");
      setEliminated([...result.attempt.eliminatedOptionIds]);
      setMarkedForReview(result.attempt.markedForReview);
      setNotes(result.attempt.notes ?? "");
      setHighlights((result.attempt.highlights as HighlightSpan[] | null) ?? []);
      setFeedback(result.feedback ? { ...result.feedback, isCorrect: result.attempt.isCorrect } : null);
      setUsedHints(result.attempt.usedHints);
      setAnswerRevealed(result.attempt.answerRevealed);
      setChatMessages(result.attempt.chatMessages);
      setAnsweredMs(result.feedback ? result.attempt.totalMs : null);
      setEliminatorMode(false);
      setQuestionStartedAt(Date.now());
      activeTrackerRef.current = new ActiveTimeTracker();
      afterFeedbackTrackerRef.current = result.feedback ? new ActiveTimeTracker() : null;

      if (!eventBufferRef.current) {
        eventBufferRef.current = new EventBuffer(setId, result.item.id, result.item.questionId);
        eventBufferRef.current.startAutoFlush();
        eventBufferRef.current.record("set_start", 0);
      } else {
        eventBufferRef.current.retarget(result.item.id, result.item.questionId);
      }
      eventBufferRef.current.record("view_enter", 0);

      const nextPos = position + 1;
      if (nextPos < questionCount && !prefetched.current.has(nextPos)) {
        getRenderedItem(setId, nextPos, false)
          .then((r) => {
            if (!cancelled) prefetched.current.set(nextPos, r);
          })
          .catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, setId]);

  // Pause/resume active time while the tab is hidden or unfocused; flush
  // (via sendBeacon) if the page is actually going away.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        activeTrackerRef.current?.pause();
        afterFeedbackTrackerRef.current?.pause();
        eventBufferRef.current?.record("view_exit", elapsedSinceStart());
      } else {
        activeTrackerRef.current?.resume();
        afterFeedbackTrackerRef.current?.resume();
        eventBufferRef.current?.record("view_enter", elapsedSinceStart());
      }
    }
    function onFocus() {
      activeTrackerRef.current?.resume();
      afterFeedbackTrackerRef.current?.resume();
      eventBufferRef.current?.record("focus", elapsedSinceStart());
    }
    function onBlur() {
      activeTrackerRef.current?.pause();
      afterFeedbackTrackerRef.current?.pause();
      eventBufferRef.current?.record("blur", elapsedSinceStart());
    }
    function onPageHide() {
      const activeMs = activeTrackerRef.current?.reset() ?? 0;
      const afterMs = afterFeedbackTrackerRef.current?.reset() ?? 0;
      if (activeMs > 0 || afterMs > 0) {
        // Best-effort — a beacon can't await, so this races the unload.
        void recordTime(setId, position, { activeMs, afterFeedbackMs: afterMs });
      }
      eventBufferRef.current?.flushBeacon();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [setId, position, elapsedSinceStart]);

  function updateNavItem(pos: number, patch: Partial<NavItemState>) {
    setItems((prev) => prev.map((it) => (it.position === pos ? { ...it, ...patch } : it)));
  }

  function handleSelect(optionId: string) {
    if (feedback) return;
    eventBufferRef.current?.record(selectedOptionId ? "change_option" : "select_option", elapsedSinceStart(), {
      optionId,
    });
    setSelectedOptionId(optionId);
  }

  async function handleToggleEliminate(optionId: string) {
    const next = await toggleEliminateOption(setId, position, optionId);
    setEliminated(next);
    const justEliminated = next.includes(optionId);
    if (justEliminated && selectedOptionId === optionId) {
      setSelectedOptionId(null);
    }
    eventBufferRef.current?.record(justEliminated ? "eliminate_option" : "restore_option", elapsedSinceStart(), {
      optionId,
    });
  }

  async function handleToggleMarkForReview() {
    const next = await toggleMarkForReview(setId, position);
    setMarkedForReview(next);
    updateNavItem(position, { markedForReview: next });
    eventBufferRef.current?.record("mark_review", elapsedSinceStart(), { marked: next });
  }

  function handleAddHighlight(span: HighlightSpan) {
    const next = [...highlights, span];
    setHighlights(next);
    eventBufferRef.current?.record("highlight_add", elapsedSinceStart(), span);
    void saveAnnotations(setId, position, { notes, highlights: next });
  }

  function handleRemoveHighlight(removed: HighlightSpan) {
    const next = highlights.filter((h) => h !== removed);
    setHighlights(next);
    eventBufferRef.current?.record("highlight_remove", elapsedSinceStart(), removed);
    void saveAnnotations(setId, position, { notes, highlights: next });
  }

  function handleClearHighlights() {
    setHighlights([]);
    eventBufferRef.current?.record("highlight_remove", elapsedSinceStart(), { all: true });
    void saveAnnotations(setId, position, { notes, highlights: [] });
  }

  function handleChangeNotes(value: string) {
    setNotes(value);
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current);
    notesSaveTimer.current = setTimeout(() => {
      eventBufferRef.current?.record("note_save", elapsedSinceStart());
      void saveAnnotations(setId, position, { notes: value, highlights });
    }, 800);
  }

  function handleSetActiveDrawer(view: DrawerView) {
    if (activeDrawer === "calculator" && view !== "calculator" && calculatorOpenedAtRef.current !== null) {
      const openMs = Date.now() - calculatorOpenedAtRef.current;
      calculatorOpenedAtRef.current = null;
      eventBufferRef.current?.record("calc_close", elapsedSinceStart());
      void recordToolUsage(setId, position, "calculator", openMs);
    }
    if (view === "calculator") {
      calculatorOpenedAtRef.current = Date.now();
      eventBufferRef.current?.record("calc_open", elapsedSinceStart());
    }
    if (view === "reference") {
      eventBufferRef.current?.record("reference_open", elapsedSinceStart());
      void recordToolUsage(setId, position, "reference");
    }
    setActiveDrawer(view);
  }

  function handleDragMove(e: PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = drag.startX - e.clientX;
    setDrawerWidth(Math.min(720, Math.max(280, drag.startWidth + delta)));
  }

  function handleDragEnd() {
    dragRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", handleDragMove);
    window.removeEventListener("pointerup", handleDragEnd);
  }

  function handleDragStart(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: drawerWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handleDragMove);
    window.addEventListener("pointerup", handleDragEnd);
  }

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handleDragMove);
      window.removeEventListener("pointerup", handleDragEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    if (feedback || submitting || !current) return;
    setSubmitting(true);
    const result = await submitAnswer(setId, position, {
      selectedOptionId: current.item.type === "mcq" ? selectedOptionId ?? undefined : undefined,
      spResponse: current.item.type === "spr" ? sprResponse : undefined,
      timeToFirstInputMs: elapsedSinceStart(),
    });
    setFeedback({ ...result, isCorrect: result.isCorrect });
    setCorrectStreak((s) => (result.isCorrect === true ? s + 1 : 0));
    setAnsweredMs(result.totalMs);
    updateNavItem(position, { status: "answered", isCorrect: result.isCorrect });
    afterFeedbackTrackerRef.current = new ActiveTimeTracker();
    eventBufferRef.current?.record("submit", elapsedSinceStart(), { isCorrect: result.isCorrect });
    eventBufferRef.current?.record("reveal_feedback", elapsedSinceStart());
    setSubmitting(false);
  }

  /** "Give up" from the coach's hint ladder — scores the question wrong and reveals the answer. */
  async function handleReveal() {
    if (feedback) return;
    const result = await revealAnswer(setId, position);
    setFeedback({ ...result, isCorrect: result.isCorrect });
    setAnswerRevealed(true);
    setCorrectStreak(0);
    setAnsweredMs(result.totalMs);
    updateNavItem(position, { status: "answered", isCorrect: result.isCorrect, answerRevealed: true });
    afterFeedbackTrackerRef.current = new ActiveTimeTracker();
    eventBufferRef.current?.record("reveal_feedback", elapsedSinceStart());
  }

  function handleHintUnlocked() {
    updateNavItem(position, { usedHint: true });
  }

  function handleCoachEvent(type: EventType, payload?: Record<string, unknown>) {
    eventBufferRef.current?.record(type, elapsedSinceStart(), payload);
  }

  function goTo(nextPos: number, navType: "nav_next" | "nav_prev" | "nav_jump") {
    if (nextPos < 0 || nextPos >= questionCount || nextPos === position) return;
    eventBufferRef.current?.record(navType, elapsedSinceStart(), { to: nextPos });
    flushTimers();
    setPosition(nextPos);
  }

  async function handleFinish() {
    flushTimers();
    eventBufferRef.current?.record("set_complete", elapsedSinceStart());
    await eventBufferRef.current?.flush();
    setFinishing(true);
    await completeSet(setId);
  }

  // Derived, not a separate state flag — true exactly while the fetched
  // item hasn't caught up to the requested position yet.
  const loading = current === null || current.item.position !== position;
  const isRW = current?.item.sectionCode === "RW";
  const isMath = current?.item.sectionCode === "MATH";
  const hasStimulus = Boolean(current?.content.stimulusHtml);
  const isLast = position === questionCount - 1;

  const questionBody = current && (
    <div className="flex flex-col gap-6">
      <Highlightable
        target="stem"
        html={current.content.stemHtml}
        highlights={highlights}
        onAddHighlight={handleAddHighlight}
        onRemoveHighlight={handleRemoveHighlight}
        className="text-base leading-relaxed [&_.katex]:text-[1.05em]"
      />
      {current.item.type === "mcq" ? (
        <ChoiceList
          options={current.content.options ?? []}
          selectedOptionId={selectedOptionId}
          eliminatedOptionIds={eliminated}
          disabled={Boolean(feedback)}
          correctOptionId={feedback?.correctOptionId ?? null}
          eliminatorMode={eliminatorMode}
          onSelect={handleSelect}
          onToggleEliminate={handleToggleEliminate}
        />
      ) : (
        <SprInput
          value={sprResponse}
          onChange={setSprResponse}
          disabled={Boolean(feedback)}
          isCorrect={feedback?.isCorrect ?? null}
          correctAnswer={feedback?.correctAnswer ?? []}
        />
      )}
      {!feedback && (
        <Button
          onClick={handleSubmit}
          disabled={
            submitting || (current.item.type === "mcq" ? !selectedOptionId : sprResponse.trim() === "")
          }
          className="self-start"
        >
          {submitting ? "Submitting…" : "Submit"}
        </Button>
      )}
      {feedback && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            {feedback.isCorrect === true && (
              <>
                <CheckCircleIcon weight="fill" className="size-4 text-tag-green-foreground" />
                <span className="text-tag-green-foreground">Correct</span>
              </>
            )}
            {feedback.isCorrect === false && (
              <>
                <XCircleIcon weight="fill" className="size-4 text-tag-red-foreground" />
                <span className="text-tag-red-foreground">Incorrect</span>
              </>
            )}
            {feedback.isCorrect === null && <span className="text-muted-foreground">Not auto-gradable</span>}
          </p>
          <div
            className="text-sm leading-relaxed text-muted-foreground [&_.katex]:text-foreground"
            dangerouslySetInnerHTML={{ __html: feedback.rationaleHtml }}
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{setName}</span>
          {current && (
            <>
              <Badge variant="secondary">{current.item.sectionCode}</Badge>
              <Badge variant={DIFFICULTY_VARIANT[current.item.difficulty as "E" | "M" | "H"] ?? "secondary"}>
                {current.item.difficulty}
              </Badge>
            </>
          )}
        </div>
        <div className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
          <span>
            Question <LiveTimer since={questionStartedAt} frozenMs={answeredMs} />
          </span>
        </div>
      </header>

      <ToolRail
        markedForReview={markedForReview}
        onToggleMarkForReview={handleToggleMarkForReview}
        eliminatorMode={eliminatorMode}
        onToggleEliminatorMode={() => setEliminatorMode((v) => !v)}
        showMathTools={isMath}
        activeDrawer={activeDrawer}
        onSetActiveDrawer={handleSetActiveDrawer}
        disabled={current?.item.type !== "mcq"}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex min-w-0 flex-1">
        <main className="min-w-0 flex-1 overflow-y-auto">
          {loading || !current ? (
            <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : isRW && hasStimulus ? (
            <div className="grid h-full grid-cols-2 divide-x divide-border">
              <div className="overflow-y-auto p-6">
                <Highlightable
                  target="stimulus"
                  html={current.content.stimulusHtml!}
                  highlights={highlights}
                  onAddHighlight={handleAddHighlight}
                  onRemoveHighlight={handleRemoveHighlight}
                  className="text-base leading-relaxed"
                />
              </div>
              <div className="overflow-y-auto p-6">{questionBody}</div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
              {hasStimulus && (
                <Highlightable
                  target="stimulus"
                  html={current.content.stimulusHtml!}
                  highlights={highlights}
                  onAddHighlight={handleAddHighlight}
                  onRemoveHighlight={handleRemoveHighlight}
                  className="text-base leading-relaxed"
                />
              )}
              {questionBody}
            </div>
          )}
        </main>

        {current && !loading && (
          <Coach
            key={position}
            setId={setId}
            position={position}
            hintsEnabled={hintsEnabled}
            gradable={current.item.gradable}
            feedback={feedback}
            usedHints={usedHints}
            answerRevealed={answerRevealed}
            correctStreak={correctStreak}
            initialChatMessages={chatMessages}
            onHintUnlocked={handleHintUnlocked}
            onReveal={handleReveal}
            onEvent={handleCoachEvent}
          />
        )}
        </div>

        {/* Contents stay mounted at all times, visibility toggled with `hidden` —
            the calculator in particular must never unmount: next/script's onLoad
            only fires on the script's first-ever load, so remounting it after
            the script is already cached leaves it permanently blank. */}
        <aside
          style={{ width: activeDrawer ? drawerWidth : 0 }}
          className={cn(
            "relative flex shrink-0 flex-col overflow-y-auto",
            activeDrawer ? "border-l border-border" : "overflow-hidden border-l-0",
          )}
        >
          {activeDrawer && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panel"
              onPointerDown={handleDragStart}
              className="absolute inset-y-0 left-0 z-10 w-1.5 -translate-x-1/2 cursor-col-resize touch-none hover:bg-primary/30"
            />
          )}
          <div hidden={activeDrawer !== "calculator"} className="flex h-full min-w-0 flex-col">
            <div className="flex gap-1 border-b border-border p-2">
              <Button
                size="sm"
                variant={desmosMode === "graphing" ? "secondary" : "ghost"}
                onClick={() => setDesmosMode("graphing")}
              >
                Graphing
              </Button>
              <Button
                size="sm"
                variant={desmosMode === "scientific" ? "secondary" : "ghost"}
                onClick={() => setDesmosMode("scientific")}
              >
                Scientific
              </Button>
            </div>
            <div className="flex-1">
              <DesmosCalculator mode={desmosMode} visible={activeDrawer === "calculator"} />
            </div>
          </div>
          <div hidden={activeDrawer !== "reference"} className="min-w-0">
            <ReferenceSheet />
          </div>
          <div hidden={activeDrawer !== "notes"} className="min-w-0">
            <NotesPanel
              notes={notes}
              highlightCount={highlights.length}
              onChangeNotes={handleChangeNotes}
              onClearHighlights={handleClearHighlights}
            />
          </div>
        </aside>
      </div>

      <footer className="flex items-center justify-between border-t border-border px-4 py-2.5">
        <Button variant="outline" size="sm" onClick={() => goTo(position - 1, "nav_prev")} disabled={position === 0}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back
        </Button>
        <QuestionNav items={items} current={position} onJump={(p) => goTo(p, "nav_jump")} />
        {isLast ? (
          <Button size="sm" onClick={handleFinish} disabled={finishing}>
            {finishing ? "Finishing…" : "Finish set"}
          </Button>
        ) : (
          <Button size="sm" onClick={() => goTo(position + 1, "nav_next")}>
            Next
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        )}
      </footer>
    </div>
  );
}
