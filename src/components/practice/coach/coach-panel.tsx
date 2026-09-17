"use client";

import { useRef, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CoachLoader } from "@/components/practice/coach/coach-loader";
import { streamPlainText } from "@/components/practice/coach/coach-stream";
import { saveCoachChat } from "@/actions/attempts";
import { LightbulbIcon, EyeIcon, PaperPlaneTiltIcon, ArrowClockwiseIcon } from "@phosphor-icons/react";
import type { CoachMessage } from "@/lib/ai/coach-prompt";

const HINT_LABELS = ["Nudge", "Approach", "Near-solution"];
const MAX_LEVEL = 3;

export interface HintEntry {
  level: number;
  content: string;
}

/**
 * Pre-answer content: the sequential hint ladder (one button advancing
 * 1→2→3, each level's meaning shown once unlocked) then a confirm-gated
 * "Reveal answer". Post-answer content is a separate component below.
 */
export function HintLadder({
  setId,
  position,
  hintsEnabled,
  gradable,
  initialHints,
  onHintUnlocked,
  onRequestHint,
  onReveal,
  onEvent,
}: {
  setId: string;
  position: number;
  hintsEnabled: boolean;
  gradable: boolean;
  initialHints: HintEntry[];
  onHintUnlocked: () => void;
  /** Called with true while a hint is streaming — drives the avatar's "thinking" mood. */
  onRequestHint: (streaming: boolean) => void;
  onReveal: () => Promise<void>;
  onEvent: (type: "hint_request" | "hint_shown" | "reveal_answer", payload?: Record<string, unknown>) => void;
}) {
  const [hints, setHints] = useState<HintEntry[]>(initialHints);
  const [streamingLevel, setStreamingLevel] = useState<number | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmingReveal, setConfirmingReveal] = useState(false);
  const [revealing, setRevealing] = useState(false);

  const nextLevel = hints.length + 1;
  const ladderDone = hints.length >= MAX_LEVEL;

  async function requestNextHint() {
    if (streamingLevel !== null || ladderDone) return;
    const level = nextLevel;
    setError(null);
    setStreamingLevel(level);
    setStreamingText("");
    onRequestHint(true);
    onEvent("hint_request", { level });

    const outcome = await streamPlainText(
      "/api/hint",
      { setId, position, level },
      (text) => setStreamingText(text),
    );

    onRequestHint(false);
    setStreamingLevel(null);
    if (!outcome.ok) {
      setError(outcome.error ?? "Couldn't get a hint right now.");
      return;
    }
    setHints((prev) => [...prev, { level, content: outcome.text }]);
    onHintUnlocked();
    onEvent("hint_shown", { level });
  }

  async function handleReveal() {
    setRevealing(true);
    onEvent("reveal_answer");
    try {
      await onReveal();
    } finally {
      setRevealing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {hints.map((h) => (
        <div key={h.level} className="flex flex-col gap-1 rounded-md bg-muted p-2.5 text-sm">
          <span className="text-xs font-medium text-muted-foreground">
            Level {h.level} · {HINT_LABELS[h.level - 1]}
          </span>
          <p className="leading-relaxed whitespace-pre-wrap">{h.content}</p>
        </div>
      ))}

      {streamingLevel !== null && (
        <div className="flex flex-col gap-1 rounded-md bg-muted p-2.5 text-sm">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            Level {streamingLevel} · {HINT_LABELS[streamingLevel - 1]}
            <CoachLoader />
          </span>
          <p className="leading-relaxed whitespace-pre-wrap">
            {streamingText || "…"}
          </p>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {!hintsEnabled ? (
        <div className="flex flex-col gap-2 rounded-md bg-muted p-2.5 text-center text-xs text-muted-foreground">
          <p>Hints need a free OpenRouter API key.</p>
          <p>
            Get one at{" "}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="underline">
              openrouter.ai/keys
            </a>{" "}
            and set <code className="font-mono">OPENROUTER_API_KEY</code>.
          </p>
        </div>
      ) : !ladderDone ? (
        <Button size="sm" variant="secondary" disabled={streamingLevel !== null} onClick={requestNextHint}>
          <LightbulbIcon data-icon="inline-start" />
          Give me a hint ({nextLevel}/{MAX_LEVEL})
        </Button>
      ) : null}

      {gradable &&
        // Gated behind the full ladder — matches the spec ("if the student
        // can't get it after all hints, reveal answer"). The one exception is
        // the no-API-key fallback: there is no ladder to climb there, so
        // Reveal is the only escape hatch and must show immediately.
        (!hintsEnabled || ladderDone) &&
        (confirmingReveal ? (
          <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
            <p className="text-xs text-muted-foreground">
              This marks the question wrong and shows the correct answer. Continue?
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" disabled={revealing} onClick={handleReveal}>
                {revealing ? "Revealing…" : "Yes, reveal it"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmingReveal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setConfirmingReveal(true)}>
            <EyeIcon data-icon="inline-start" />
            Reveal answer
          </Button>
        ))}
    </div>
  );
}

const SUGGESTED_PROMPTS = (wrong: boolean) =>
  [
    "Explain this question",
    wrong ? "Why is my answer wrong?" : null,
    "Why is the right answer right?",
    "Show me another way to solve it",
  ].filter((p): p is string => p !== null);

/** Post-answer content: a chat about this question, full context held server-side. */
export function CoachChat({
  setId,
  position,
  hintsEnabled,
  wrong,
  initialMessages,
  onEvent,
  onStreaming,
}: {
  setId: string;
  position: number;
  hintsEnabled: boolean;
  wrong: boolean;
  /** Restores a chat left behind on an earlier visit to this question — see practice-runner.tsx's load effect. */
  initialMessages: CoachMessage[];
  onEvent: (type: "coach_message" | "coach_chat_cleared", payload?: Record<string, unknown>) => void;
  /** Drives the avatar's "thinking" mood while a reply streams. */
  onStreaming?: (streaming: boolean) => void;
}) {
  const [messages, setMessages] = useState<CoachMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    setError(null);
    setDraft("");
    const next: CoachMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setStreaming(true);
    onStreaming?.(true);
    onEvent("coach_message", { role: "user" });
    // Placeholder assistant turn, filled in as tokens arrive.
    setMessages([...next, { role: "assistant", content: "" }]);

    const outcome = await streamPlainText(
      "/api/coach",
      { setId, position, kind: "chat", messages: next },
      (text) => setMessages([...next, { role: "assistant", content: text }]),
    );

    setStreaming(false);
    onStreaming?.(false);
    if (!outcome.ok) {
      setMessages(next);
      setError(outcome.error ?? "Couldn't reach the coach right now.");
      return;
    }
    const finalMessages: CoachMessage[] = [...next, { role: "assistant", content: outcome.text }];
    setMessages(finalMessages);
    onEvent("coach_message", { role: "assistant" });
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "nearest" }));
    // Fire-and-forget, same convention as saveAnnotations/recordToolUsage —
    // a lost write here just means the next visit doesn't restore this last
    // turn, not a scoring or correctness problem.
    void saveCoachChat(setId, position, finalMessages);
  }

  function handleClear() {
    setMessages([]);
    setError(null);
    onEvent("coach_chat_cleared");
    void saveCoachChat(setId, position, []);
  }

  if (!hintsEnabled) {
    return (
      <div className="flex flex-col gap-2 p-3 text-center text-xs text-muted-foreground">
        <p>Chatting about this question needs a free OpenRouter API key.</p>
        <p>
          Get one at{" "}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="underline">
            openrouter.ai/keys
          </a>{" "}
          and set <code className="font-mono">OPENROUTER_API_KEY</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      {messages.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {messages.length} message{messages.length === 1 ? "" : "s"}
          </span>
          <Button variant="ghost" size="sm" onClick={handleClear}>
            Clear chat
          </Button>
        </div>
      )}

      {messages.length === 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">Ask about this question, or try:</p>
          {SUGGESTED_PROMPTS(wrong).map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => send(prompt)}
              className="rounded-md border border-border px-2.5 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-sm leading-relaxed whitespace-pre-wrap",
                m.role === "user" ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted",
              )}
            >
              {m.content || (streaming && i === messages.length - 1 ? <CoachLoader /> : "")}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send(draft);
          }}
          placeholder="Ask a follow-up…"
          disabled={streaming}
        />
        <Button size="icon-sm" variant="secondary" disabled={streaming || !draft.trim()} onClick={() => send(draft)}>
          {streaming ? <ArrowClockwiseIcon className="size-3.5 animate-spin" /> : <PaperPlaneTiltIcon className="size-3.5" />}
        </Button>
      </div>
    </div>
  );
}
