"use client";

// Live cursor tracking for the coach avatar.
//
// This drives `AvatarController.setEyeOffset` — a continuous pupil offset that
// is applied on top of whatever expression or animation is active, and never
// touches the playback state machine. It does not exist in the published
// @bible-strong/avatar-react: the underlying `eyeOffset` render option is
// already part of avatar-core's `RenderAvatarOptions`, but nothing ever
// threaded it through `renderAvatarFrame` to the React layer. Both packages
// are patched to wire it up (`patches/@bible-strong__avatar-*.patch`, applied
// by pnpm via `patchedDependencies` in pnpm-workspace.yaml) — see CLAUDE.md.
//
// Because gaze is independent of the expression/animation systems, the eyes
// keep following the cursor *during* reaction animations, and the avatar needs
// no gaze-specific expressions in its definition.
import { useEffect, type RefObject } from "react";
import type { AvatarController } from "@/components/procedural-avatar/strobi-avatar";

/** Pupil travel at full deflection, in the definition's head-surface units (head RADIUS is 120). */
const MAX_OFFSET = 22;
/** Cursor distance in px at which deflection saturates. Short, so direction dominates over distance. */
const FULL_REACH_PX = 220;
/** Fraction of the remaining distance covered per frame — the glide that keeps tracking from snapping. */
const EASING = 0.18;
/** Below this (head-surface units) the eyes are close enough to stop the animation frame loop. */
const SETTLE_EPSILON = 0.05;

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Points the avatar's pupils at the cursor for as long as it is mounted,
 * easing toward each new target rather than jumping to it. Holds still for
 * `prefers-reduced-motion`.
 *
 * @param avatarRef the avatar's controller
 * @param anchorRef the element whose center the cursor angle is measured from
 */
export function useCursorGaze(
  avatarRef: RefObject<AvatarController | null>,
  anchorRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let frame = 0;
    let running = false;

    function step() {
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      if (Math.abs(dx) < SETTLE_EPSILON && Math.abs(dy) < SETTLE_EPSILON) {
        current.x = target.x;
        current.y = target.y;
        avatarRef.current?.setEyeOffset(current);
        running = false;
        return;
      }
      current.x += dx * EASING;
      current.y += dy * EASING;
      avatarRef.current?.setEyeOffset(current);
      frame = requestAnimationFrame(step);
    }

    function ensureRunning() {
      if (running) return;
      running = true;
      frame = requestAnimationFrame(step);
    }

    function handlePointerMove(event: PointerEvent) {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const distance = Math.hypot(dx, dy);
      if (distance < 1) {
        target.x = 0;
        target.y = 0;
      } else {
        // Screen axes map straight through: +x is right, +y is down, matching
        // the definition's own eye coordinates (neutral sits at y: -7, and
        // looking up is more negative still).
        const scale = (smoothstep(Math.min(distance / FULL_REACH_PX, 1)) * MAX_OFFSET) / distance;
        target.x = dx * scale;
        target.y = dy * scale;
      }
      ensureRunning();
    }

    window.addEventListener("pointermove", handlePointerMove);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      cancelAnimationFrame(frame);
    };
  }, [avatarRef, anchorRef]);
}
