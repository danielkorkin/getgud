// Server-only. Turns a raw College Board content field (`stem`, `stimulus`,
// `rationale`, or one `answerOptions[].content`) into finished, sanitized
// HTML with all math rendered by KaTeX. Two math representations coexist in
// the loaded data (see CLAUDE.md):
//
//   qbank : real <math alttext="…">…</math> MathML, including deprecated
//           <mfenced> that no browser's native MathML Core renders.
//   saic  : <span class="math-latex" data-latex="…">…</span> — the visible
//           text is College Board's spoken-math alt description; the LaTeX
//           lives in the attribute, not in the text node.
//
// Both are converted to LaTeX and rendered through the same KaTeX path, so
// typography is consistent everywhere. Verified during planning: 14,156/
// 14,156 unique qbank MathML blocks convert at mathMlToLatex's "high"
// confidence with zero throws; ~1.3% of those (plus a handful of saic
// values) need `applyLatexHygiene` first to satisfy KaTeX's tokenizer. Any
// input KaTeX still can't parse degrades to the alt-text description
// (never a crash, never dropped content — the same principle
// scripts/lib/html.ts already applies).
//
// This must stay server-only: scripts/lib/html.ts (reused for entity
// decoding) imports node:crypto, and isomorphic-dompurify pulls in jsdom.
import "server-only";

import katex from "katex";
import DOMPurify from "isomorphic-dompurify";
import { decodeHtmlEntities, escapeHtml, escapeHtmlAttr } from "@scripts/lib/html";
import { mathMlToLatex } from "@scripts/lib/mathml-to-latex";
import { applyLatexHygiene } from "./latex-hygiene";

// DOMPurify's stock `svg` profile omits `<use>` (an external-reference
// vector) entirely — but College Board's matplotlib-generated figures
// (312 qbank stems/stimuli) rely on it for every axis label, tick number,
// and arrowhead: glyphs are defined once in <defs> and drawn via
// <use xlink:href="#glyph-id">. Allow the tag, but only keep a same-
// document fragment reference (`#id`) — an absolute/external href on a
// `<use>` is stripped rather than followed.
DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
  if (node.tagName === "use" && (data.attrName === "href" || data.attrName === "xlink:href")) {
    if (!data.attrValue.startsWith("#")) data.keepAttr = false;
  }
});

const MATH_TAG_RE = /<math\b[^>]*>[\s\S]*?<\/math>/g;
const ALTTEXT_ATTR_RE = /\balttext="([^"]*)"/;
const MATH_LATEX_SPAN_RE = /<span class="math-latex" data-latex="([^"]*)">([\s\S]*?)<\/span>/g;
const TABLE_TAG_RE = /<table\b[^>]*>[\s\S]*?<\/table>/g;

/**
 * Wrap each `<table>` (a data table in a stimulus/stem — College Board's own
 * markup, not something this pipeline generates) in a scroll container and
 * strip the legacy `border` attribute College Board's HTML carries, which
 * would otherwise double up with the `.qbank-table-wrap` CSS rules in
 * globals.css. Run after DOMPurify so the wrapper `<div>` never has to pass
 * through sanitization itself.
 */
function wrapTables(html: string): string {
  return html.replace(TABLE_TAG_RE, (table) =>
    `<div class="qbank-table-wrap">${table.replace(/ border="[^"]*"/, "")}</div>`,
  );
}

/**
 * Render one LaTeX string to sanitized KaTeX HTML, degrading to
 * `fallbackText` on any failure. Uses `output: "html"` rather than KaTeX's
 * default `htmlAndMathml` — the MathML half needs `<semantics>`/
 * `<annotation>`, which DOMPurify either strips (dropping the whole thing)
 * or keeps with its text content exposed as visible text (leaking raw
 * LaTeX source onto the page) — neither is worth it here. Screen-reader
 * support instead comes from `role="math" aria-label="…"`, using
 * `fallbackText` — College Board's own alt/spoken-math description, i.e.
 * exactly the string meant to be read aloud.
 */
function renderLatex(tex: string, fallbackText: string): string {
  const label = fallbackText.trim();
  try {
    const html = katex.renderToString(applyLatexHygiene(tex), {
      throwOnError: true,
      output: "html",
    });
    return label ? `<span role="math" aria-label="${escapeHtmlAttr(label)}">${html}</span>` : html;
  } catch {
    return label ? `<span class="math-alt">${escapeHtml(label)}</span>` : "";
  }
}

function renderQbankMath(html: string): string {
  return html.replace(MATH_TAG_RE, (block) => {
    const altRaw = ALTTEXT_ATTR_RE.exec(block)?.[1] ?? "";
    const alt = decodeHtmlEntities(altRaw);
    try {
      const { latex } = mathMlToLatex(block);
      return renderLatex(latex, alt || latex);
    } catch {
      // Malformed MathML the converter's recursive-descent parser rejected —
      // fall back to the <math alttext="…"> the block itself carries.
      return alt ? `<span class="math-alt">${escapeHtml(alt)}</span>` : block;
    }
  });
}

function renderSaicMath(html: string): string {
  return html.replace(MATH_LATEX_SPAN_RE, (_span, dataLatexRaw: string, visibleInner: string) => {
    const latex = decodeHtmlEntities(dataLatexRaw);
    return renderLatex(latex, visibleInner);
  });
}

// Per-field LRU (small process-lifetime cache). Keyed by `${contentHash}:
// ${field}` rather than contentHash alone — stem/stimulus/rationale/each
// option render independently and a bare hash would collide across them.
const CACHE_MAX_ENTRIES = 2000;
const renderCache = new Map<string, string>();

function cacheGet(key: string): string | undefined {
  const hit = renderCache.get(key);
  if (hit === undefined) return undefined;
  // Refresh recency.
  renderCache.delete(key);
  renderCache.set(key, hit);
  return hit;
}

function cacheSet(key: string, value: string): void {
  renderCache.set(key, value);
  if (renderCache.size > CACHE_MAX_ENTRIES) {
    const oldest = renderCache.keys().next().value;
    if (oldest !== undefined) renderCache.delete(oldest);
  }
}

export interface RenderContentFieldInput {
  /** Raw HTML from `stem` / `stimulus` / `rationale` / one `answerOptions[].content`. Null-safe. */
  html: string | null | undefined;
  /** `Question.contentHash` — the cache/memoization key's stable half. */
  contentHash: string;
  /** Discriminates which field this is, e.g. "stem", "stimulus", "rationale", `option:${optionId}`. */
  field: string;
}

/**
 * Convert a raw College Board content field into sanitized, KaTeX-rendered
 * HTML safe to hand to `dangerouslySetInnerHTML`. Figures (inline `<svg>`,
 * base64 `<img>`) pass through untouched — there is nothing to render, only
 * to sanitize.
 */
export function renderContentField({ html, contentHash, field }: RenderContentFieldInput): string {
  if (!html) return "";

  const key = `${contentHash}:${field}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  const withMath = renderSaicMath(renderQbankMath(html));
  const sanitized = DOMPurify.sanitize(withMath, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    // The 81 saic questions with a content figure embed it as a base64
    // <img>; DOMPurify's default policy strips data: URIs unless allowed.
    ADD_DATA_URI_TAGS: ["img"],
    // See the uponSanitizeAttribute hook above — <use> is allowed, but only
    // a fragment (#id) href survives it.
    ADD_TAGS: ["use"],
    ADD_ATTR: ["xlink:href"],
  });
  const result = wrapTables(sanitized);

  cacheSet(key, result);
  return result;
}

/**
 * Render one author-written LaTeX string (a formula in a Learn guide — see
 * src/resources/spec.ts's `formulas` block) to KaTeX HTML.
 *
 * Exists so the Learn section's math goes through exactly the same KaTeX +
 * `applyLatexHygiene` path as question content, rather than standing up a
 * second renderer that could drift from it typographically.
 *
 * Unlike `renderContentField` this takes LaTeX directly — there's no
 * MathML, no College Board markup, and nothing to sanitize beyond what
 * KaTeX emits, because the input is committed source in this repo rather
 * than scraped content. It is deliberately NOT safe to call on untrusted
 * input: there is no DOMPurify pass here. `name` is used as the accessible
 * label, which is the closest thing a hand-authored formula has to
 * College Board's spoken-math alt text.
 */
export function renderGuideLatex(latex: string, name: string): string {
  return renderLatex(latex, name);
}
