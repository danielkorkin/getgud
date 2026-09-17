// Regenerates the coach avatar's gaze-tracking expressions in
// src/avatars/strobi.avatar.json: `coach-gaze-up` (a literal field-wise
// midpoint of two of Strobi's built-in expressions, closing the one gap
// between verified directional gazes wide enough to be visually obvious)
// and the 24 `gaze-000`..`gaze-345` buckets (15° apart) that
// src/components/practice/coach/continuous-gaze.ts picks from by nearest
// angle at runtime. See that file's header comment for why these are
// pre-baked into the committed definition rather than computed at runtime.
//
// Idempotent — re-run after hand-editing any of the six base anchor
// expressions below, and it regenerates `coach-gaze-up` and all 24 buckets
// from scratch. Requires a visual re-check afterward (e.g. in /styleguide)
// before committing: this only guarantees smooth interpolation between the
// anchors, not that any specific bucket still reads as a coherent gaze.
//
// Usage: tsx scripts/generate-gaze-expressions.ts
import fs from "node:fs";
import path from "node:path";

const DEFINITION_PATH = path.join(import.meta.dirname, "..", "src", "avatars", "strobi.avatar.json");

interface Eye {
  width: number;
  height: number;
  x: number;
  y: number;
  angle: number;
}
interface ExpressionDef {
  head: { x: number; y: number; z: number };
  eyes: { left: Eye; right: Eye; spacing: number };
  perspective: number;
  motion: { eyes: string; body: string };
}
interface Definition {
  expressions: Record<string, ExpressionDef>;
  expressionOrder: string[];
}

interface Field {
  headX: number;
  headY: number;
  headZ: number;
  lw: number;
  lh: number;
  ly: number;
  la: number;
  rw: number;
  rh: number;
  ry: number;
  ra: number;
  spacing: number;
}

function toField(def: ExpressionDef): Field {
  return {
    headX: def.head.x,
    headY: def.head.y,
    headZ: def.head.z,
    lw: def.eyes.left.width,
    lh: def.eyes.left.height,
    ly: def.eyes.left.y,
    la: def.eyes.left.angle,
    rw: def.eyes.right.width,
    rh: def.eyes.right.height,
    ry: def.eyes.right.y,
    ra: def.eyes.right.angle,
    spacing: def.eyes.spacing,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function blend(a: Field, b: Field, t: number): Field {
  const out = {} as Field;
  for (const k of Object.keys(a) as (keyof Field)[]) out[k] = lerp(a[k], b[k], t);
  return out;
}

function fieldToExpression(f: Field): ExpressionDef {
  return {
    head: { x: f.headX, y: f.headY, z: f.headZ },
    eyes: {
      left: { width: f.lw, height: f.lh, x: 0, y: f.ly, angle: f.la },
      right: { width: f.rw, height: f.rh, x: 0, y: f.ry, angle: f.ra },
      spacing: f.spacing,
    },
    perspective: 1,
    motion: { eyes: "none", body: "none" },
  };
}

function insertAfter(order: string[], after: string, keys: string[]) {
  const filtered = order.filter((k) => !keys.includes(k));
  const idx = filtered.indexOf(after);
  filtered.splice(idx + 1, 0, ...keys);
  return filtered;
}

const raw: Definition = JSON.parse(fs.readFileSync(DEFINITION_PATH, "utf8"));

// Six built-in expressions confirmed by eye (screenshots in /styleguide) to
// read as clean, coherent directional gazes, at their screen-space angle
// (0 = right, 90 = down, matching atan2(dy, dx)).
const curiousLeft = toField(raw.expressions["curious-left"]);
const upwardSideGlance = toField(raw.expressions["upward-side-glance"]);

// coach-gaze-up: a literal midpoint of the two anchors either side of the
// widest gap (135°) between them — not guessed from scratch.
raw.expressions["coach-gaze-up"] = fieldToExpression(blend(curiousLeft, upwardSideGlance, 0.5));
raw.expressionOrder = insertAfter(raw.expressionOrder, "curious-left", ["coach-gaze-up"]);

const anchors: { key: string; angle: number }[] = [
  { key: "far-right-glance", angle: 0 },
  { key: "playful-right", angle: 45 },
  { key: "downward-gaze", angle: 90 },
  { key: "wide-down-left", angle: 135 },
  { key: "curious-left", angle: 180 },
  { key: "coach-gaze-up", angle: 247.5 }, // -112.5
  { key: "upward-side-glance", angle: 315 }, // -45
];

const STEP_DEG = 15;
const BUCKET_COUNT = 360 / STEP_DEG;
const bucketKeys: string[] = [];

for (let i = 0; i < BUCKET_COUNT; i++) {
  const angle = i * STEP_DEG;
  let a: string | undefined;
  let b: string | undefined;
  let frac = 0;
  for (let j = 0; j < anchors.length; j++) {
    const cur = anchors[j];
    const next = anchors[(j + 1) % anchors.length];
    const nextAngle = j === anchors.length - 1 ? next.angle + 360 : next.angle;
    if (angle >= cur.angle && angle <= nextAngle) {
      a = cur.key;
      b = next.key;
      const span = nextAngle - cur.angle;
      frac = span === 0 ? 0 : (angle - cur.angle) / span;
      break;
    }
  }
  if (!a || !b) throw new Error(`No bracket found for angle ${angle}`);

  const blended = blend(toField(raw.expressions[a]), toField(raw.expressions[b]), frac);
  const key = `gaze-${String(angle).padStart(3, "0")}`;
  raw.expressions[key] = fieldToExpression(blended);
  bucketKeys.push(key);
}

raw.expressionOrder = insertAfter(raw.expressionOrder, "coach-gaze-up", bucketKeys);

fs.writeFileSync(DEFINITION_PATH, JSON.stringify(raw, null, 2) + "\n");
console.log(`Wrote coach-gaze-up and ${bucketKeys.length} gaze buckets to ${DEFINITION_PATH}`);
