// Resolve every unique math-img equation image to LaTeX, trying the
// cheapest and most certain method first:
//
//   1. PNG-embedded MathML (the image's own rendering source — 100%
//      accurate by construction, see png-mathml.ts).
//   2. The spoken-math grammar over College Board's alt-text description
//      (a real parse, not a guess — see spoken-math.ts). Only trusted when
//      it consumes the ENTIRE alt string.
//
// Anything neither method resolves is written out as an actual PNG file
// under data/raw/vision/needs-review/ for a human or vision-capable model
// to transcribe by hand — never guessed.

import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

import { extractMathImages, type MathImageInfo } from "./math-images";
import { extractMathMlFromPng } from "./png-mathml";
import { mathMlToLatex } from "./mathml-to-latex";
import { ParseError, spokenMathToLatex } from "./spoken-math";
import { DATA_DIR } from "./qbank";

export type EquationSource = "png-mathml" | "spoken-math-alt-text" | "manual";

export interface ResolvedEquation {
  hash: string;
  status: "resolved";
  latex: string;
  source: EquationSource;
  /** College Board's own alt text, kept for the visible fallback content. */
  alt: string;
}

export interface UnresolvedEquation {
  hash: string;
  status: "unresolved";
  alt: string;
  reason: string;
}

export type EquationResolution = ResolvedEquation | UnresolvedEquation;

export const VISION_DIR = `${DATA_DIR}/vision`;
export const LATEX_CACHE_FILE = `${VISION_DIR}/latex-cache.json`;
export const NEEDS_REVIEW_DIR = `${VISION_DIR}/needs-review`;
export const MANUAL_OVERRIDES_FILE = `${VISION_DIR}/manual-overrides.json`;

export function resolveEquation(info: MathImageInfo): EquationResolution {
  const mathml = extractMathMlFromPng(info.base64);
  if (mathml) {
    try {
      const converted = mathMlToLatex(mathml);
      if (converted.confidence === "high") {
        return { hash: info.hash, status: "resolved", latex: converted.latex, source: "png-mathml", alt: info.alt };
      }
    } catch {
      // fall through to the alt-text parser
    }
  }

  if (info.alt.trim()) {
    try {
      const parsed = spokenMathToLatex(info.alt);
      return {
        hash: info.hash,
        status: "resolved",
        latex: parsed.latex,
        source: "spoken-math-alt-text",
        alt: info.alt,
      };
    } catch (err) {
      const reason = err instanceof ParseError ? err.message : String(err);
      return { hash: info.hash, status: "unresolved", alt: info.alt, reason };
    }
  }

  return { hash: info.hash, status: "unresolved", alt: info.alt, reason: "no alt text and no embedded MathML" };
}

/** Load manual overrides (hand-transcribed LaTeX for images neither
 * automated method could resolve). Missing file = empty map. */
export async function loadManualOverrides(): Promise<Map<string, string>> {
  if (!existsSync(MANUAL_OVERRIDES_FILE)) return new Map();
  const raw: unknown = JSON.parse(await readFile(MANUAL_OVERRIDES_FILE, "utf8"));
  const map = new Map<string, string>();
  if (raw && typeof raw === "object") {
    for (const [hash, latex] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof latex === "string") map.set(hash, latex);
    }
  }
  return map;
}

/** Run resolution over every unique equation image in the corpus, writing
 * the LaTeX cache and any needs-review PNGs to disk. Returns a summary. */
export async function buildEquationCache(): Promise<{
  total: number;
  resolved: Record<EquationSource, number>;
  unresolved: number;
}> {
  await mkdir(VISION_DIR, { recursive: true });
  await mkdir(NEEDS_REVIEW_DIR, { recursive: true });

  const images = extractMathImages();
  const manualOverrides = await loadManualOverrides();

  const cache: Record<string, EquationResolution> = {};
  const resolved: Record<EquationSource, number> = { "png-mathml": 0, "spoken-math-alt-text": 0, manual: 0 };
  let unresolved = 0;

  for (const [hash, info] of images) {
    if (manualOverrides.has(hash)) {
      cache[hash] = { hash, status: "resolved", latex: manualOverrides.get(hash)!, source: "manual", alt: info.alt };
      resolved.manual++;
      continue;
    }

    const result = resolveEquation(info);
    cache[hash] = result;
    if (result.status === "resolved") {
      resolved[result.source]++;
    } else {
      unresolved++;
      const pngPath = `${NEEDS_REVIEW_DIR}/${hash}.png`;
      if (!existsSync(pngPath)) {
        await writeFile(pngPath, Buffer.from(info.base64, "base64"));
      }
    }
  }

  await writeFile(LATEX_CACHE_FILE, JSON.stringify(cache));

  // Remove stale needs-review PNGs for images a parser improvement (or a
  // manual override) has since resolved — keeps the folder an accurate
  // reflection of what still genuinely needs a human/vision pass.
  for (const file of await readdir(NEEDS_REVIEW_DIR)) {
    const hash = file.replace(/\.png$/, "");
    if (cache[hash]?.status === "resolved") {
      await unlink(`${NEEDS_REVIEW_DIR}/${file}`);
    }
  }

  return { total: images.size, resolved, unresolved };
}

export async function loadEquationCache(): Promise<Map<string, EquationResolution>> {
  if (!existsSync(LATEX_CACHE_FILE)) return new Map();
  const raw: Record<string, EquationResolution> = JSON.parse(await readFile(LATEX_CACHE_FILE, "utf8"));
  return new Map(Object.entries(raw));
}
