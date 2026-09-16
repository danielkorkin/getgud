"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

interface DesmosCalculatorInstance {
  destroy(): void;
  resize(): void;
}

declare global {
  interface Window {
    Desmos?: {
      GraphingCalculator: (element: HTMLElement, options?: Record<string, unknown>) => DesmosCalculatorInstance;
      ScientificCalculator: (element: HTMLElement, options?: Record<string, unknown>) => DesmosCalculatorInstance;
    };
  }
}

export type DesmosMode = "graphing" | "scientific";

/**
 * Mounts both the graphing and scientific calculators once and keeps both
 * alive for the life of the runner — only visibility toggles with `mode`
 * and `visible`, so switching tabs (or drawers) never loses graph state.
 * Callers must keep this component mounted even while its drawer is closed
 * (hide it with `hidden`/width-0, not by unmounting) — `next/script`'s
 * `onLoad` fires only on the script's first-ever load, so a component that
 * unmounts and remounts after the script is already cached never flips
 * `ready` back to true and renders permanently blank.
 */
export function DesmosCalculator({ mode, visible }: { mode: DesmosMode; visible: boolean }) {
  const graphingContainer = useRef<HTMLDivElement>(null);
  const scientificContainer = useRef<HTMLDivElement>(null);
  const graphing = useRef<DesmosCalculatorInstance | null>(null);
  const scientific = useRef<DesmosCalculatorInstance | null>(null);
  const [ready, setReady] = useState(false);

  const apiKey = process.env.NEXT_PUBLIC_DESMOS_API_KEY;

  useEffect(() => {
    if (!ready || !window.Desmos) return;
    if (graphingContainer.current && !graphing.current) {
      graphing.current = window.Desmos.GraphingCalculator(graphingContainer.current, {
        keypad: true,
        settingsMenu: false,
        expressionsCollapsed: false,
      });
    }
    if (scientificContainer.current && !scientific.current) {
      scientific.current = window.Desmos.ScientificCalculator(scientificContainer.current);
    }
    return () => {
      graphing.current?.destroy();
      scientific.current?.destroy();
      graphing.current = null;
      scientific.current = null;
    };
  }, [ready]);

  useEffect(() => {
    if (!visible) return;
    if (mode === "graphing") graphing.current?.resize();
    else scientific.current?.resize();
  }, [mode, visible]);

  if (!apiKey) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <p>Calculator needs a free Desmos API key.</p>
        <p>
          Get one at{" "}
          <a href="https://www.desmos.com/api" target="_blank" rel="noreferrer" className="underline">
            desmos.com/api
          </a>{" "}
          and set <code className="font-mono text-xs">NEXT_PUBLIC_DESMOS_API_KEY</code>.
        </p>
      </div>
    );
  }

  return (
    <>
      <Script
        src={`https://www.desmos.com/api/v1.11/calculator.js?apiKey=${apiKey}`}
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />
      <div ref={graphingContainer} className="size-full" hidden={mode !== "graphing"} />
      <div ref={scientificContainer} className="size-full" hidden={mode !== "scientific"} />
    </>
  );
}
