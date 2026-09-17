"use client";

// Note: @bible-strong/avatar-react / -core (StrobiAvatar's renderer) are
// AGPL-3.0-only. They were already a dependency, rendered only on
// /styleguide before this — this is the first time Strobi appears on the
// main product surface, worth knowing if this repo's licensing posture
// ever needs revisiting.
import { useEffect, useRef, useState } from "react";
import {
  StrobiAvatar,
  strobiDefinition,
  type AvatarController,
} from "@/components/procedural-avatar/strobi-avatar";
import { useCursorGaze } from "@/components/practice/coach/continuous-gaze";
import { HintLadder, CoachChat, type HintEntry } from "@/components/practice/coach/coach-panel";
import { streamPlainText } from "@/components/practice/coach/coach-stream";
import type { RevealedFeedback } from "@/actions/attempts";
import type { EventType } from "@/lib/event-types";
import { XIcon } from "@phosphor-icons/react";

type AnimationKey = keyof typeof strobiDefinition.animations;
type Feedback = RevealedFeedback & { isCorrect: boolean | null };

const WRONG_MOODS: AnimationKey[] = ["sad", "angry", "confused"];
const PRAISE = [
  "Nice work — that's correct!",
  "Exactly right. Nice job.",
  "Yes! Nailed it.",
  "Correct — keep that up.",
];
const IDLE_RETURN_MS = 4000;
const AVATAR_SIZE = 84;
/**
 * Resting animation. Deliberately not Strobi's stock "idle", which alternates
 * between `upward-side-glance` and `curious-left` — both poses rotate the head
 * hard (head.y +27.8 / -17.6), so the eyes rest ~49 units right of center and
 * the entire cursor-tracking range lands right of center too (the avatar
 * literally cannot look left). `coach-idle` holds `neutral` and blinks, giving
 * the gaze offset a centered origin and a symmetric range.
 */
const IDLE_ANIMATION = "coach-idle" as AnimationKey;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * The floating coach: an avatar that reacts to each submission, a feedback
 * bubble shown before the student moves on, and a click-to-open panel — the
 * hint ladder pre-answer, a full chat post-answer. Mounted with `key={position}`
 * by the parent so every piece of state below resets per question for free.
 */
export function Coach({
  setId,
  position,
  hintsEnabled,
  gradable,
  feedback,
  usedHints,
  answerRevealed,
  correctStreak,
  onHintUnlocked,
  onReveal,
  onEvent,
}: {
  setId: string;
  position: number;
  hintsEnabled: boolean;
  gradable: boolean;
  feedback: Feedback | null;
  usedHints: HintEntry[];
  answerRevealed: boolean;
  /** Correct-in-a-row count going into (and including) this question's outcome — drives celebrate vs. plain happy. */
  correctStreak: number;
  onHintUnlocked: () => void;
  onReveal: () => Promise<void>;
  onEvent: (type: EventType, payload?: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [animation, setAnimation] = useState<AnimationKey>(IDLE_ANIMATION);
  const [bubble, setBubble] = useState<{ text: string; streaming: boolean } | null>(null);

  const mountedRef = useRef(false);
  const prevFeedbackRef = useRef(feedback);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarButtonRef = useRef<HTMLButtonElement>(null);
  const avatarRef = useRef<AvatarController>(null);

  // Gaze rides on top of the animation rather than replacing it, so the eyes
  // keep tracking the cursor through every reaction too.
  useCursorGaze(avatarRef, avatarButtonRef);

  function scheduleIdleReturn() {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setAnimation(IDLE_ANIMATION), IDLE_RETURN_MS);
  }

  async function streamSummary() {
    setBubble({ text: "", streaming: true });
    const outcome = await streamPlainText(
      "/api/coach",
      { setId, position, kind: "summary" },
      (text) => setBubble({ text, streaming: true }),
    );
    setBubble({
      text: outcome.ok && outcome.text ? outcome.text : (outcome.error ?? "Not quite — see the explanation below."),
      streaming: false,
    });
  }

  // React only to a *fresh* answer submitted while this component is
  // mounted — not to loading an already-answered question on mount (that's
  // a revisit, and re-generating a summary every time would be a cost leak).
  // Since the parent remounts this component per-position (key={position}),
  // "mount" and "question changed" are the same event here.
  useEffect(() => {
    const prev = prevFeedbackRef.current;
    prevFeedbackRef.current = feedback;
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (prev || !feedback) return;

    // Deferred one tick, not called synchronously at the top of the effect
    // body (a rendering cascade react-hooks/set-state-in-effect flags) —
    // same idiom as set-builder-form.tsx's countLoading effect.
    const timer = setTimeout(() => {
      if (feedback.isCorrect === true) {
        setAnimation(correctStreak >= 3 ? "celebrate" : "happy");
        setBubble({ text: pick(PRAISE), streaming: false });
      } else if (feedback.isCorrect === false) {
        if (answerRevealed) {
          setAnimation("sad");
          setBubble({ text: "You revealed the answer — check the explanation below.", streaming: false });
        } else {
          setAnimation(pick(WRONG_MOODS));
          if (hintsEnabled) void streamSummary();
          else setBubble({ text: "Not quite — see the explanation below.", streaming: false });
        }
      } else {
        setAnimation("curious");
        setBubble({ text: "This one isn't auto-gradable — check the explanation below.", streaming: false });
      }
      scheduleIdleReturn();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback]);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) onEvent("coach_open");
  }

  const answered = feedback !== null;
  const wrong = feedback?.isCorrect === false;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-end p-4">
      <div className="pointer-events-auto flex flex-col items-end gap-2">
        {
          // `hidden`, not unmounted on close — HintLadder/CoachChat hold their
          // own in-progress state (unlocked hints, chat history) that must
          // survive closing the panel to read the passage and reopening it;
          // only navigating to a new question (Coach's key={position} remount
          // in practice-runner.tsx) should reset that state. Same "stays
          // mounted, toggle hidden" convention practice-runner.tsx itself uses
          // for the calculator/reference/notes drawers.
        }
        <div
          hidden={!open}
          className="coach-panel-in flex max-h-[60vh] w-80 flex-col overflow-y-auto rounded-lg border border-border bg-popover shadow-md"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-medium">
              {answered ? "Ask about this question" : "Need a hint?"}
            </span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
          {answered ? (
            <CoachChat
              setId={setId}
              position={position}
              hintsEnabled={hintsEnabled}
              wrong={wrong}
              onEvent={onEvent}
              onStreaming={(streaming) => {
                if (streaming) {
                  if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
                  setAnimation("thinking");
                } else {
                  scheduleIdleReturn();
                }
              }}
            />
          ) : (
            <HintLadder
              setId={setId}
              position={position}
              hintsEnabled={hintsEnabled}
              gradable={gradable}
              initialHints={usedHints}
              onHintUnlocked={onHintUnlocked}
              onRequestHint={(streaming) => {
                if (streaming) {
                  if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
                  setAnimation("thinking");
                } else {
                  scheduleIdleReturn();
                }
              }}
              onReveal={onReveal}
              onEvent={onEvent}
            />
          )}
        </div>

        {bubble && !open && (
          <div className="coach-bubble max-w-72 rounded-lg border border-border bg-popover px-3 py-2 text-sm leading-relaxed text-popover-foreground shadow-md">
            {bubble.text || "…"}
          </div>
        )}

        <button
          ref={avatarButtonRef}
          type="button"
          onClick={toggleOpen}
          aria-label={answered ? "Ask the coach about this question" : "Get a hint"}
          className="flex shrink-0 items-center justify-center rounded-full bg-transparent transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <StrobiAvatar
            ref={avatarRef}
            animation={animation}
            size={AVATAR_SIZE}
            className="drop-shadow-lg"
          />
        </button>
      </div>
    </div>
  );
}
