"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

type Level = 1 | 2 | 3;
const LEVELS: { level: Level; label: string }[] = [
  { level: 1, label: "Nudge" },
  { level: 2, label: "Approach" },
  { level: 3, label: "Near-solution" },
];

export function HintPanel({
  setId,
  position,
  hintsEnabled,
  onHintShown,
}: {
  setId: string;
  position: number;
  hintsEnabled: boolean;
  onHintShown: (level: Level) => void;
}) {
  const [level, setLevel] = useState<Level | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hintsEnabled) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <p>Hints need a free OpenRouter API key.</p>
        <p>
          Get one at{" "}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="underline">
            openrouter.ai/keys
          </a>{" "}
          and set <code className="font-mono text-xs">OPENROUTER_API_KEY</code>.
        </p>
      </div>
    );
  }

  async function requestHint(l: Level) {
    setLevel(l);
    setText("");
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setId, position, level: l }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Couldn't get a hint right now.");
        setLoading(false);
        return;
      }
      onHintShown(l);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setText((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch {
      setError("Couldn't get a hint right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap gap-2">
        {LEVELS.map((l) => (
          <Button
            key={l.level}
            size="sm"
            variant={level === l.level ? "default" : "outline"}
            disabled={loading}
            onClick={() => requestHint(l.level)}
          >
            {l.label}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {(loading || text) && (
        <p className={cn("text-sm leading-relaxed whitespace-pre-wrap", loading && !text && "text-muted-foreground")}>
          {text || "Thinking…"}
        </p>
      )}
    </div>
  );
}
