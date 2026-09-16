"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { cn } from "cn";
import {
  startModule,
  getExamItem,
  saveExamResponse,
  submitModule,
  startBreak,
  skipBreak,
  type ExamItemResult,
} from "@/actions/exams";
import {
  toggleEliminateOption,
  toggleMarkForReview,
  saveAnnotations,
  recordToolUsage,
  recordTime,
} from "@/actions/attempts";
import { EventBuffer, ActiveTimeTracker } from "@/lib/events";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToolRail, type DrawerView } from "@/components/practice/tool-rail";
import { ChoiceList } from "@/components/practice/choice-list";
import { SprInput } from "@/components/practice/spr-input";
import { Highlightable, type HighlightSpan } from "@/components/practice/highlightable";
import { DesmosCalculator } from "@/components/practice/desmos-calculator";
import { ReferenceSheet } from "@/components/practice/reference-sheet";
import { NotesPanel } from "@/components/practice/notes-panel";
import { ExamHeader } from "./exam-header";
import { ExamDirections } from "./exam-directions";
import { ExamBreak } from "./exam-break";
import { ExamTimeExpired } from "./exam-time-expired";
import { ExamQuestionNav, type ExamNavItemState } from "./exam-question-nav";
import { ExamReviewPage } from "./exam-review-page";
import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react";
import type { ExamPhase } from "@/lib/exam/phases";

export interface ExamRunnerModule {
  sectionCode: "RW" | "MATH";
  moduleIndex: 1 | 2;
  minutes: number;
  itemCount: number;
  startPosition: number;
  deadlineAt: string | null;
  status: "pending" | "active" | "submitted";
}

export interface ExamRunnerProps {
  sessionId: string;
  examName: string;
  phase: ExamPhase;
  serverNow: string;
  module: ExamRunnerModule | null;
  breakStartedAt: string | null;
  breakEndsAt: string | null;
  initialPosition: number;
  navItems: ExamNavItemState[];
  /** True when this *_active module's deadline had already passed at page-load time (tab-was-closed expiry path). */
  expired: boolean;
}

export function ExamRunner({
  sessionId,
  examName,
  phase,
  serverNow,
  module,
  breakStartedAt,
  breakEndsAt,
  initialPosition,
  navItems: initialNavItems,
  expired: initialExpired,
}: ExamRunnerProps) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [pending, setPending] = useState(false);
  const [moduleExpired, setModuleExpired] = useState(initialExpired);
  const [reviewMode, setReviewMode] = useState(false);
  const [navItems, setNavItems] = useState(initialNavItems);

  const [position, setPosition] = useState(initialPosition);
  const [current, setCurrent] = useState<ExamItemResult | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [sprResponse, setSprResponse] = useState("");
  const [eliminated, setEliminated] = useState<string[]>([]);
  const [markedForReview, setMarkedForReview] = useState(false);
  const [notes, setNotes] = useState("");
  const [highlights, setHighlights] = useState<HighlightSpan[]>([]);
  const [activeDrawer, setActiveDrawer] = useState<DrawerView>(null);
  const [drawerWidth, setDrawerWidth] = useState(384);
  const [desmosMode, setDesmosMode] = useState<"graphing" | "scientific">("graphing");
  const [eliminatorMode, setEliminatorMode] = useState(false);
  const [questionStartedAt, setQuestionStartedAt] = useState(() => Date.now());

  const eventBufferRef = useRef<EventBuffer | null>(null);
  const activeTrackerRef = useRef<ActiveTimeTracker | null>(null);
  const calculatorOpenedAtRef = useRef<number | null>(null);
  const notesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sprSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const lastModuleKeyRef = useRef<string | null>(null);
  const expireHandledRef = useRef(false);

  const elapsedSinceStart = useCallback(() => Date.now() - questionStartedAt, [questionStartedAt]);

  const refresh = useCallback(() => {
    startRefresh(() => router.refresh());
  }, [router, startRefresh]);

  const flushTimers = useCallback(() => {
    const activeMs = activeTrackerRef.current?.reset() ?? 0;
    if (activeMs > 0) void recordTime(sessionId, position, { activeMs });
    void eventBufferRef.current?.flush();
  }, [sessionId, position]);

  // Reset local question state to a fresh module's start position whenever
  // the server hands us a new module (a phase transition landed us on a
  // different active module than before).
  useEffect(() => {
    if (!module) return;
    const key = `${module.sectionCode}-${module.moduleIndex}`;
    if (lastModuleKeyRef.current === key) return;
    lastModuleKeyRef.current = key;
    setPosition(initialPosition);
    setReviewMode(false);
    setModuleExpired(initialExpired);
    setNavItems(initialNavItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module?.sectionCode, module?.moduleIndex]);

  // Load the current question whenever the position changes, while the
  // module is active and not expired.
  useEffect(() => {
    if (!module || module.status !== "active" || moduleExpired || reviewMode) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await getExamItem(sessionId, position);
        if (cancelled) return;
        setCurrent(result);
        setSelectedOptionId(result.response.selectedOptionId);
        setSprResponse(result.response.spResponse ?? "");
        setEliminated([...result.response.eliminatedOptionIds]);
        setMarkedForReview(result.response.markedForReview);
        setNotes(result.response.notes ?? "");
        setHighlights((result.response.highlights as HighlightSpan[] | null) ?? []);
        setEliminatorMode(false);
        setQuestionStartedAt(Date.now());
        activeTrackerRef.current = new ActiveTimeTracker();

        if (!eventBufferRef.current) {
          eventBufferRef.current = new EventBuffer(sessionId, result.item.id, result.item.questionId);
          eventBufferRef.current.startAutoFlush();
          eventBufferRef.current.record("set_start", 0);
        } else {
          eventBufferRef.current.retarget(result.item.id, result.item.questionId);
        }
        eventBufferRef.current.record("view_enter", 0);
      } catch {
        // Module ended server-side while we were loading — resync.
        setModuleExpired(true);
        refresh();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, position, module?.status, moduleExpired, reviewMode]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        activeTrackerRef.current?.pause();
        eventBufferRef.current?.record("view_exit", elapsedSinceStart());
      } else {
        activeTrackerRef.current?.resume();
        eventBufferRef.current?.record("view_enter", elapsedSinceStart());
      }
    }
    function onFocus() {
      activeTrackerRef.current?.resume();
      eventBufferRef.current?.record("focus", elapsedSinceStart());
    }
    function onBlur() {
      activeTrackerRef.current?.pause();
      eventBufferRef.current?.record("blur", elapsedSinceStart());
    }
    function onPageHide() {
      const activeMs = activeTrackerRef.current?.reset() ?? 0;
      if (activeMs > 0) void recordTime(sessionId, position, { activeMs });
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
  }, [sessionId, position, elapsedSinceStart]);

  function updateNavItem(pos: number, patch: Partial<ExamNavItemState>) {
    setNavItems((prev) => prev.map((it) => (it.position === pos ? { ...it, ...patch } : it)));
  }

  async function saveResponse(input: { selectedOptionId?: string | null; spResponse?: string | null }) {
    const result = await saveExamResponse(sessionId, position, { ...input, timeToFirstInputMs: elapsedSinceStart() });
    if (!result.ok) {
      setModuleExpired(true);
      refresh();
    }
  }

  function handleSelect(optionId: string) {
    if (moduleExpired) return;
    eventBufferRef.current?.record(selectedOptionId ? "change_option" : "select_option", elapsedSinceStart(), { optionId });
    setSelectedOptionId(optionId);
    updateNavItem(position, { answered: true });
    void saveResponse({ selectedOptionId: optionId });
  }

  function handleSprChange(value: string) {
    setSprResponse(value);
    updateNavItem(position, { answered: value.trim() !== "" });
    if (sprSaveTimer.current) clearTimeout(sprSaveTimer.current);
    sprSaveTimer.current = setTimeout(() => {
      void saveResponse({ spResponse: value });
    }, 500);
  }

  async function handleToggleEliminate(optionId: string) {
    try {
      const next = await toggleEliminateOption(sessionId, position, optionId);
      setEliminated(next);
      const justEliminated = next.includes(optionId);
      if (justEliminated && selectedOptionId === optionId) setSelectedOptionId(null);
      eventBufferRef.current?.record(justEliminated ? "eliminate_option" : "restore_option", elapsedSinceStart(), { optionId });
    } catch {
      setModuleExpired(true);
      refresh();
    }
  }

  async function handleToggleMarkForReview() {
    try {
      const next = await toggleMarkForReview(sessionId, position);
      setMarkedForReview(next);
      updateNavItem(position, { markedForReview: next });
      eventBufferRef.current?.record("mark_review", elapsedSinceStart(), { marked: next });
    } catch {
      setModuleExpired(true);
      refresh();
    }
  }

  function handleAddHighlight(span: HighlightSpan) {
    const next = [...highlights, span];
    setHighlights(next);
    eventBufferRef.current?.record("highlight_add", elapsedSinceStart(), span);
    void saveAnnotations(sessionId, position, { notes, highlights: next }).catch(() => {});
  }

  function handleRemoveHighlight(removed: HighlightSpan) {
    const next = highlights.filter((h) => h !== removed);
    setHighlights(next);
    eventBufferRef.current?.record("highlight_remove", elapsedSinceStart(), removed);
    void saveAnnotations(sessionId, position, { notes, highlights: next }).catch(() => {});
  }

  function handleClearHighlights() {
    setHighlights([]);
    eventBufferRef.current?.record("highlight_remove", elapsedSinceStart(), { all: true });
    void saveAnnotations(sessionId, position, { notes, highlights: [] }).catch(() => {});
  }

  function handleChangeNotes(value: string) {
    setNotes(value);
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current);
    notesSaveTimer.current = setTimeout(() => {
      eventBufferRef.current?.record("note_save", elapsedSinceStart());
      void saveAnnotations(sessionId, position, { notes: value, highlights }).catch(() => {});
    }, 800);
  }

  function handleSetActiveDrawer(view: DrawerView) {
    if (activeDrawer === "calculator" && view !== "calculator" && calculatorOpenedAtRef.current !== null) {
      const openMs = Date.now() - calculatorOpenedAtRef.current;
      calculatorOpenedAtRef.current = null;
      eventBufferRef.current?.record("calc_close", elapsedSinceStart());
      void recordToolUsage(sessionId, position, "calculator", openMs).catch(() => {});
    }
    if (view === "calculator") {
      calculatorOpenedAtRef.current = Date.now();
      eventBufferRef.current?.record("calc_open", elapsedSinceStart());
    }
    if (view === "reference") {
      eventBufferRef.current?.record("reference_open", elapsedSinceStart());
      void recordToolUsage(sessionId, position, "reference").catch(() => {});
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

  function goTo(nextPos: number, navType: "nav_next" | "nav_prev" | "nav_jump") {
    if (!module) return;
    if (nextPos < module.startPosition || nextPos >= module.startPosition + module.itemCount || nextPos === position) return;
    eventBufferRef.current?.record(navType, elapsedSinceStart(), { to: nextPos });
    flushTimers();
    setPosition(nextPos);
  }

  async function handleStartModule() {
    setPending(true);
    await startModule(sessionId);
    setPending(false);
    refresh();
  }

  async function handleStartBreak() {
    setPending(true);
    await startBreak(sessionId);
    setPending(false);
    refresh();
  }

  async function handleSkipBreak() {
    setPending(true);
    await skipBreak(sessionId);
    setPending(false);
    refresh();
  }

  async function handleSubmitModule(auto: boolean) {
    if (expireHandledRef.current && auto) return;
    if (auto) expireHandledRef.current = true;
    flushTimers();
    // set_complete means the whole 98-question exam is done, not just this
    // module — only true when submitting the final (Math Module 2) module.
    if (phase === "math_2_active") {
      eventBufferRef.current?.record("set_complete", elapsedSinceStart());
    }
    await eventBufferRef.current?.flush();
    setPending(true);
    await submitModule(sessionId, { auto });
    setPending(false);
    // Deliberately NOT setting reviewMode/moduleExpired back to false here:
    // `module` in this closure is still the just-submitted module until
    // router.refresh() below delivers fresh props, and clearing either flag
    // now would let the content-loading effect re-fire against a module
    // the server has already marked 'submitted' (getExamItem then throws
    // "This module is not currently active"). The module-transition effect
    // resets both once a genuinely new module arrives in props.
    refresh();
  }

  const isMath = module?.sectionCode === "MATH";
  const showChrome = module?.status === "active" && !moduleExpired && !reviewMode;
  const loading = showChrome && (current === null || current.item.position !== position);
  const isRW = current?.module.sectionCode === "RW";
  const hasStimulus = Boolean(current?.content.stimulusHtml);
  const isLastInModule = module ? position === module.startPosition + module.itemCount - 1 : false;

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
          disabled={false}
          correctOptionId={null}
          eliminatorMode={eliminatorMode}
          onSelect={handleSelect}
          onToggleEliminate={handleToggleEliminate}
        />
      ) : (
        <SprInput value={sprResponse} onChange={handleSprChange} disabled={false} isCorrect={null} correctAnswer={[]} />
      )}
    </div>
  );

  return (
    <div className="flex h-screen flex-col">
      <ExamHeader
        examName={examName}
        module={module ? { sectionCode: module.sectionCode, moduleIndex: module.moduleIndex } : null}
        deadlineAt={showChrome ? (module?.deadlineAt ?? null) : null}
        serverNow={serverNow}
        onExpire={() => {
          // handleSubmitModule's own expireHandledRef guard is the single
          // source of truth for "have we already auto-submitted" — don't
          // duplicate it here, or the guard trips against itself and the
          // submit never runs at all.
          setModuleExpired(true);
          void handleSubmitModule(true);
        }}
      />

      {showChrome && (
        <ToolRail
          markedForReview={markedForReview}
          onToggleMarkForReview={handleToggleMarkForReview}
          eliminatorMode={eliminatorMode}
          onToggleEliminatorMode={() => setEliminatorMode((v) => !v)}
          showMathTools={isMath}
          showHint={false}
          activeDrawer={activeDrawer}
          onSetActiveDrawer={handleSetActiveDrawer}
          disabled={current?.item.type !== "mcq"}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        <main className="min-w-0 flex-1 overflow-y-auto">
          {phase.endsWith("_directions") && module && (
            <ExamDirections
              sectionCode={module.sectionCode}
              moduleIndex={module.moduleIndex}
              minutes={module.minutes}
              itemCount={module.itemCount}
              onContinue={handleStartModule}
              pending={pending}
            />
          )}

          {phase === "break" && (
            <ExamBreak
              breakStartedAt={breakStartedAt}
              breakEndsAt={breakEndsAt}
              serverNow={serverNow}
              onStart={handleStartBreak}
              onSkip={handleSkipBreak}
              pending={pending}
            />
          )}

          {module?.status === "active" && moduleExpired && !reviewMode && (
            <ExamTimeExpired onContinue={() => handleSubmitModule(true)} pending={pending} />
          )}

          {module?.status === "active" && !moduleExpired && reviewMode && (
            <ExamReviewPage
              sectionCode={module.sectionCode}
              moduleIndex={module.moduleIndex}
              items={navItems}
              onJump={(p) => {
                setReviewMode(false);
                setPosition(p);
              }}
              onBack={() => setReviewMode(false)}
              onSubmit={() => handleSubmitModule(false)}
              submitting={pending}
            />
          )}

          {showChrome &&
            (loading || !current ? (
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
            ))}
        </main>

        {/* Always mounted, visibility toggled with `hidden` — Desmos must
            never unmount (next/script's onLoad only fires once). */}
        <aside
          style={{ width: showChrome && activeDrawer ? drawerWidth : 0 }}
          className={cn(
            "relative flex shrink-0 flex-col overflow-y-auto",
            showChrome && activeDrawer ? "border-l border-border" : "overflow-hidden border-l-0",
          )}
        >
          {showChrome && activeDrawer && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panel"
              onPointerDown={handleDragStart}
              className="absolute inset-y-0 left-0 z-10 w-1.5 -translate-x-1/2 cursor-col-resize touch-none hover:bg-primary/30"
            />
          )}
          <div hidden={!showChrome || activeDrawer !== "calculator"} className="flex h-full min-w-0 flex-col">
            <div className="flex gap-1 border-b border-border p-2">
              <Button size="sm" variant={desmosMode === "graphing" ? "secondary" : "ghost"} onClick={() => setDesmosMode("graphing")}>
                Graphing
              </Button>
              <Button size="sm" variant={desmosMode === "scientific" ? "secondary" : "ghost"} onClick={() => setDesmosMode("scientific")}>
                Scientific
              </Button>
            </div>
            <div className="flex-1">
              <DesmosCalculator mode={desmosMode} visible={showChrome && activeDrawer === "calculator"} />
            </div>
          </div>
          <div hidden={!showChrome || activeDrawer !== "reference"} className="min-w-0">
            <ReferenceSheet />
          </div>
          <div hidden={!showChrome || activeDrawer !== "notes"} className="min-w-0">
            <NotesPanel notes={notes} highlightCount={highlights.length} onChangeNotes={handleChangeNotes} onClearHighlights={handleClearHighlights} />
          </div>
        </aside>
      </div>

      {showChrome && module && (
        <footer className="flex items-center justify-between border-t border-border px-4 py-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => goTo(position - 1, "nav_prev")}
            disabled={position === module.startPosition}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Back
          </Button>
          <ExamQuestionNav
            items={navItems}
            current={position}
            onJump={(p) => goTo(p, "nav_jump")}
            onOpenReview={() => setReviewMode(true)}
          />
          {isLastInModule ? (
            <Button size="sm" onClick={() => setReviewMode(true)}>
              Review
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          ) : (
            <Button size="sm" onClick={() => goTo(position + 1, "nav_next")}>
              Next
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          )}
        </footer>
      )}
    </div>
  );
}
