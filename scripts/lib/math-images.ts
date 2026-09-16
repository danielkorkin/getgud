// Extract every unique base64 `<img class="math-img">` embedded in the
// disclosed/IBN saic payloads (the only source that ever has these — qbank
// content uses real MathML). Dedup by content hash: many equation images
// repeat verbatim across questions (single digits, "x", "y", "negative 1",
// …), so converting unique images instead of occurrences cuts the one-time
// transcription workload substantially.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

import { IBN_DIR } from "./qbank";

export interface MathImageInfo {
  hash: string;
  base64: string;
  /** College Board's own alt-text description, if any (most images have one). */
  alt: string;
  /** Every ibn question id that references this exact image. */
  questionIds: string[];
}

const MATH_IMG_RE =
  /<img[^>]*class="math-img"[^>]*src="data:image\/png;base64,([^"]+)"[^>]*alt="([^"]*)"[^>]*>/g;

function hashOf(base64: string): string {
  return createHash("sha256").update(base64).digest("hex");
}

/** Scan every data/raw/ibn/*.json file and return the deduplicated set of
 * math-img images found across prompt/body/rationale/choice bodies. */
export function extractMathImages(): Map<string, MathImageInfo> {
  const images = new Map<string, MathImageInfo>();

  for (const file of readdirSync(IBN_DIR)) {
    if (!file.endsWith(".json")) continue;
    const questionId = file.replace(/\.json$/, "");
    const raw: unknown = JSON.parse(readFileSync(`${IBN_DIR}/${file}`, "utf8"));
    if (!Array.isArray(raw)) continue;

    const blobs: string[] = [];
    for (const el of raw) {
      if (typeof el !== "object" || el === null) continue;
      const item = el as Record<string, unknown>;
      if (typeof item.prompt === "string") blobs.push(item.prompt);
      if (typeof item.body === "string") blobs.push(item.body);
      const answer = item.answer as Record<string, unknown> | undefined;
      if (answer) {
        if (typeof answer.rationale === "string") blobs.push(answer.rationale);
        const choices = answer.choices as Record<string, { body?: string }> | undefined;
        if (choices) {
          for (const choice of Object.values(choices)) {
            if (typeof choice.body === "string") blobs.push(choice.body);
          }
        }
      }
    }

    for (const html of blobs) {
      MATH_IMG_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = MATH_IMG_RE.exec(html))) {
        const [, base64, alt] = match;
        const hash = hashOf(base64);
        const existing = images.get(hash);
        if (existing) {
          if (!existing.questionIds.includes(questionId)) existing.questionIds.push(questionId);
        } else {
          images.set(hash, { hash, base64, alt, questionIds: [questionId] });
        }
      }
    }
  }

  return images;
}
