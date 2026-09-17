// Idle-time "eyes follow the cursor" for the coach avatar.
//
// @bible-strong/avatar-core's public API (`createAvatar`, `AvatarController`,
// the `expression` prop) only ever accepts a *named* key into the avatar's
// expression table — there is no prop or ref method that takes a raw numeric
// pose. A first attempt here tried to exploit `resolveExpression`'s live
// `definition.expressions[key]` read by injecting scratch keys into
// `strobiDefinition` at runtime — that does NOT work: `createAvatar`
// validates its `definition` argument once at call time and renders from a
// deep-frozen *clone* (`avatar-core/dist/index.js`'s `z()`/`B()`), not the
// live object reference. Mutating `strobiDefinition` afterwards is invisible
// to the already-created avatar (confirmed empirically — it logs
// `[Avatar] Unknown expression '<key>'` and ignores the update).
//
// So instead of continuous values, this pre-bakes fine-grained *named*
// expressions directly into `strobi.avatar.json` at 15° increments
// (`gaze-000` … `gaze-345`, 24 total — see the generation note in that file)
// by field-wise blending between six of Strobi's built-in expressions
// confirmed by eye to read as clean directional gazes, plus a 7th
// ("coach-gaze-up") added the same way to close the one gap between them
// wide enough to be visually obvious (curious-left / upward-side-glance,
// 135° apart) — interpolated from those two verified anchors, not guessed.
// All 24 exist in the committed, validated definition, so there's no
// runtime-mutation trap: picking the nearest one is a plain lookup, and the
// avatar's own ~420ms built-in expression transition smooths the motion
// between buckets closely enough, at this density, to read as continuous
// tracking rather than snapping.
import { strobiDefinition } from "@/components/procedural-avatar/strobi-avatar";

export type ExpressionKey = keyof typeof strobiDefinition.expressions;

export const GAZE_NEUTRAL = "neutral" as ExpressionKey;

const GAZE_STEP_DEG = 15;
/** Mouse within this many px of the avatar's center looks straight ahead instead of snapping to a bucket. */
const GAZE_DEADZONE_PX = 28;

function normalizeAngle(deg: number): number {
  const a = deg % 360;
  return a < 0 ? a + 360 : a;
}

/** Nearest of the 24 pre-baked `gaze-NNN` buckets, or `neutral` inside the deadzone. */
export function computeGazeKey(dx: number, dy: number): ExpressionKey {
  if (Math.hypot(dx, dy) < GAZE_DEADZONE_PX) return GAZE_NEUTRAL;
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const bucket = Math.round(normalizeAngle(angleDeg) / GAZE_STEP_DEG) * GAZE_STEP_DEG;
  const wrapped = bucket % 360;
  const key = `gaze-${String(wrapped).padStart(3, "0")}`;
  return key as ExpressionKey;
}
