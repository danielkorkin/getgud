import { createHash } from "node:crypto";

// Minimal HTML text helpers for normalizing scraped question content.
//
// Why this exists: College Board's disclosed/IBN item format (saic.collegeboard.org)
// renders every equation as a pre-rendered base64 PNG (<img class="math-img">)
// instead of markup. Storing that verbatim would mean "an equation" in the
// database is an opaque image blob. The qbank-sourced items (the other ~88%
// of the corpus) already carry real <math> MathML — no image, nothing to fix.
//
// For the saic/IBN images, scripts/lib/equation-cache.ts resolves ~99.9% of
// them to real LaTeX with zero guessing: either the image's own embedded
// MathML source (scripts/lib/png-mathml.ts — 100% accurate by construction)
// or a real recursive-descent parse of College Board's alt-text description
// (scripts/lib/spoken-math.ts). `stripMathImages` below consults that cache
// (via `latexLookup`) and upgrades a resolved image to a `math-latex` span;
// anything not in the cache falls back to the image's own `alt` text, and an
// image with neither is left in place — a real formula with zero recoverable
// representation, never silently dropped.

const MATH_IMG_RE = /<img\b[^>]*\bclass="math-img"[^>]*>/g;
const SRC_ATTR_RE = /\bsrc="data:image\/png;base64,([^"]+)"/;
const ALT_ATTR_RE = /\balt="([^"]*)"/;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  deg: "°",
  macr: "¯",
  plusmn: "±",
  times: "×",
  divide: "÷",
  le: "≤",
  ge: "≥",
  ne: "≠",
  infin: "∞",
  pi: "π",
  middot: "·",
  minus: "−",
  ang: "∠",
};

/** Decode the small set of HTML entities that show up in College Board content. */
export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const codePoint =
        entity[1] === "x" || entity[1] === "X"
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

/** Escape text for safe placement as HTML element content. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escape text for safe placement inside a double-quoted HTML attribute. */
export function escapeHtmlAttr(input: string): string {
  return escapeHtml(input).replace(/"/g, "&quot;");
}

export interface MathImageStripResult {
  html: string;
  /** Images upgraded to real LaTeX (via `latexLookup`) or, failing that,
   * replaced with their alt-text description. */
  replaced: number;
  /** Images left in place: no cached LaTeX AND `alt` was empty/missing —
   * no text of any kind to substitute. */
  unresolved: number;
}

function hashBase64(base64: string): string {
  return createHash("sha256").update(base64).digest("hex");
}

/**
 * Replace every `<img class="math-img" ... src="data:image/png;base64,..."
 * alt="...">` in `html`. Priority: (1) a cached LaTeX transcription looked
 * up by the image's own content hash (see equation-cache.ts) — rendered as
 * `<span class="math-latex" data-latex="...">`, real math, not prose; (2)
 * the image's own `alt` text, rendered as `<span class="math-alt">`; (3) if
 * neither exists, the image is left in place — a real formula with zero
 * recoverable representation, never silently dropped.
 */
export function stripMathImages(html: string, latexLookup?: Map<string, string>): MathImageStripResult {
  let replaced = 0;
  let unresolved = 0;
  const out = html.replace(MATH_IMG_RE, (tag) => {
    const altMatch = ALT_ATTR_RE.exec(tag);
    const alt = altMatch ? decodeHtmlEntities(altMatch[1]) : "";

    if (latexLookup) {
      const srcMatch = SRC_ATTR_RE.exec(tag);
      const latex = srcMatch ? latexLookup.get(hashBase64(srcMatch[1])) : undefined;
      if (latex !== undefined) {
        replaced++;
        const visible = alt.trim() || latex;
        return `<span class="math-latex" data-latex="${escapeHtmlAttr(latex)}">${escapeHtml(visible)}</span>`;
      }
    }

    if (alt.trim() === "") {
      unresolved++;
      return tag;
    }
    replaced++;
    return `<span class="math-alt">${escapeHtml(alt)}</span>`;
  });
  return { html: out, replaced, unresolved };
}
