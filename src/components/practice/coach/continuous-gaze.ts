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
//
// **Reach is measured against the viewport, not a fixed pixel radius.** The
// coach floats in the bottom-right corner, so the screen around it is wildly
// lopsided: a few hundred px to the right and below, but potentially thousands
// up and to the left. An earlier version saturated at a flat 220px from the
// avatar, which meant the whole upper-left region — i.e. most of the screen —
// sat pinned at maximum deflection and stopped responding to the cursor at
// all. Instead, each axis is normalized by the distance from the avatar to the
// viewport edge *on that side*, so the eyes travel their full range across
// whatever space actually exists in every direction.
import { useEffect, type RefObject } from "react";
import type { AvatarController } from "@/components/procedural-avatar/strobi-avatar";

/**
 * Pupil travel per axis at full deflection, in the definition's head-surface
 * units. The head radius is 120; even a 46-unit offset leaves the eye ~104
 * units from center, so it stays inside the silhouette (the eyes are clipped
 * to the head) and never rotates past the horizon into invisibility.
 */
const MAX_AXIS_OFFSET = 34;
/** Safety cap on the combined vector, so a corner diagonal can't exceed verified travel. */
const MAX_OFFSET = 44;
/** Exponential smoothing time constant. Higher = heavier glide. */
const SMOOTHING_TAU_MS = 85;
/** Floor for an axis' available space, so an avatar flush against an edge can't divide by ~0. */
const MIN_SPAN_PX = 140;
/** Below this (head-surface units) the eyes have arrived and the frame loop can stop. */
const SETTLE_EPSILON = 0.02;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Points the avatar's pupils at the cursor for as long as it is mounted,
 * gliding toward each new target rather than jumping to it. Holds still for
 * `prefers-reduced-motion`.
 *
 * @param avatarRef the avatar's controller
 * @param anchorRef the element whose center the cursor is measured against
 */
export function useCursorGaze(
  avatarRef: RefObject<AvatarController | null>,
  anchorRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    /** Latest cursor position in client coords; null until the pointer is first seen. */
    let pointerX: number | null = null;
    let pointerY: number | null = null;
    const current = { x: 0, y: 0 };
    let frame = 0;
    let lastFrameAt = 0;

    /**
     * Where the pupils should sit for the current cursor position. Recomputed
     * every frame rather than on the pointer event, so it stays correct when
     * the page scrolls or the layout shifts the avatar under a still cursor.
     */
    function targetOffset(): { x: number; y: number } {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect || pointerX === null || pointerY === null) return { x: 0, y: 0 };

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = pointerX - centerX;
      const dy = pointerY - centerY;

      // Space available on the side the cursor is actually on.
      const spanX = Math.max(dx < 0 ? centerX : window.innerWidth - centerX, MIN_SPAN_PX);
      const spanY = Math.max(dy < 0 ? centerY : window.innerHeight - centerY, MIN_SPAN_PX);

      // Each axis maps independently across the space that exists on that
      // side. Pointing along the true angle to the cursor sounds more correct
      // but behaves badly here: parked in a corner, the avatar sees almost no
      // angular change across a whole quadrant (two points 500px apart in the
      // upper-left differ by ~4°), so the eyes look frozen over most of the
      // screen. Mapping position-to-position instead keeps every part of the
      // viewport on a live gradient, and the direction still always reads as
      // toward the cursor because both signs are preserved.
      let x = clamp(dx / spanX, -1, 1) * MAX_AXIS_OFFSET;
      let y = clamp(dy / spanY, -1, 1) * MAX_AXIS_OFFSET;

      // Screen axes map straight through: +x right, +y down, matching the
      // definition's own eye coordinates.
      const magnitude = Math.hypot(x, y);
      if (magnitude > MAX_OFFSET) {
        x = (x / magnitude) * MAX_OFFSET;
        y = (y / magnitude) * MAX_OFFSET;
      }
      return { x, y };
    }

    function step(now: number) {
      const target = targetOffset();
      // Time-based smoothing, so the glide feels identical on a 60Hz and a
      // 120Hz display instead of running twice as fast on the latter.
      const elapsed = lastFrameAt === 0 ? 16 : Math.min(now - lastFrameAt, 100);
      lastFrameAt = now;
      const alpha = 1 - Math.exp(-elapsed / SMOOTHING_TAU_MS);

      const dx = target.x - current.x;
      const dy = target.y - current.y;
      if (Math.abs(dx) < SETTLE_EPSILON && Math.abs(dy) < SETTLE_EPSILON) {
        current.x = target.x;
        current.y = target.y;
        avatarRef.current?.setEyeOffset(current);
        frame = 0;
        lastFrameAt = 0;
        return;
      }

      current.x += dx * alpha;
      current.y += dy * alpha;
      avatarRef.current?.setEyeOffset(current);
      frame = requestAnimationFrame(step);
    }

    function ensureRunning() {
      if (frame !== 0) return;
      lastFrameAt = 0;
      frame = requestAnimationFrame(step);
    }

    function handlePointerMove(event: PointerEvent) {
      pointerX = event.clientX;
      pointerY = event.clientY;
      ensureRunning();
    }

    // Scrolling or resizing moves the avatar out from under a stationary
    // cursor, which changes where it should be looking.
    function handleViewportChange() {
      if (pointerX !== null) ensureRunning();
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [avatarRef, anchorRef]);
}
