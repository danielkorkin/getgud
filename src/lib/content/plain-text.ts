// Server-only. Strips a raw College Board content field down to plain text
// for the AI hint prompt — no HTML tags, math rendered as its spoken-word
// or LaTeX form rather than markup. Deliberately simpler than render.ts:
// the model reads text, it doesn't need KaTeX.
import "server-only";

import { decodeHtmlEntities } from "@scripts/lib/html";

const MATH_TAG_RE = /<math\b[^>]*>[\s\S]*?<\/math>/g;
const ALTTEXT_ATTR_RE = /\balttext="([^"]*)"/;
const MATH_LATEX_SPAN_RE = /<span class="math-latex" data-latex="([^"]*)">([\s\S]*?)<\/span>/g;
const TAG_RE = /<[^>]+>/g;

/** Convert one raw content field to plain text suitable for an LLM prompt. */
export function toPlainText(html: string | null | undefined): string {
  if (!html) return "";

  let out = html
    // qbank: prefer the alttext spoken-math description over raw MathML tags.
    .replace(MATH_TAG_RE, (block) => {
      const alt = ALTTEXT_ATTR_RE.exec(block)?.[1] ?? "";
      return alt ? ` ${decodeHtmlEntities(alt)} ` : "";
    })
    // saic: the LaTeX itself reads fine as plain text for a model prompt.
    .replace(MATH_LATEX_SPAN_RE, (_span, dataLatex: string) => ` ${decodeHtmlEntities(dataLatex)} `)
    // Strip any remaining tags (figures, tables, base64 images, formatting).
    .replace(TAG_RE, " ");

  out = decodeHtmlEntities(out);
  return out.replace(/\s+/g, " ").trim();
}
