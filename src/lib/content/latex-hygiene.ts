// Fixes a narrow, verified defect in LaTeX emitted by
// `scripts/lib/mathml-to-latex.ts` (and, rarely, in the `saic` pipeline's
// cached `data-latex` values): a command name glued directly to the
// following identifier with no separator, because the MathML source had no
// space node between an operator and the adjacent variable —
// `\angleACB`, `\leqx`, `\cdotg`, `\pir` (meant "∠ACB", "≤x", "·g", "πr").
// KaTeX's control-word tokenizer greedily consumes every following letter,
// so these throw as an undefined control sequence instead of rendering.
//
// Verified against the full loaded corpus (14,156 unique MathML blocks +
// 2,640 saic `data-latex` values, see the practice-generator plan): the
// emitted command vocabulary is closed and small, so a targeted fix here is
// safe — this file does NOT touch `scripts/lib/mathml-to-latex.ts` itself,
// which CLAUDE.md flags as correctness-sensitive and which also feeds the
// committed `latex-cache.json`.
//
// Two passes:
//  1. Bare trig/log function names ("cos66", "tan T", "tanW") are prefixed
//     with a backslash so they render upright instead of as three italic
//     variables — but only when not already gluing onto a lowercase word
//     ("cost", "login"), to avoid mangling genuine prose.
//  2. Every command in the closed vocabulary — including the
//     newly-backslashed trig names — gets a space inserted when glued
//     directly to a following letter. Commands that take a brace/paren
//     argument (`\frac`, `\sqrt`, `\left`, ...) are never actually followed
//     by a bare letter in this converter's valid output (always `{` or an
//     escaped delimiter), so including them in the same pass is safe.

const BARE_FUNCTION_NAMES = ["sin", "cos", "tan", "sec", "csc", "cot", "log", "ln"] as const;

const KNOWN_COMMANDS = [
  "left",
  "right",
  "frac",
  "times",
  "sqrt",
  "circ",
  "text",
  "mathrm",
  "pi",
  "leq",
  "angle",
  "overline",
  "geq",
  "pm",
  "begin",
  "end",
  "approx",
  "triangle",
  "cdot",
  "div",
  "rightarrow",
  "infty",
  "neq",
  ...BARE_FUNCTION_NAMES,
] as const;

// Not preceded by a backslash (so we never double-escape an occurrence a
// prior pass already fixed), and not immediately followed by a lowercase
// letter — the right-hand guard is what actually protects real words
// ("cost", "login", "seconds", "cotangent" all fail it because the letter
// right after the matched span is lowercase). The left side deliberately
// allows a preceding letter: content like "ktan33" (k·tan(33°), a
// single-letter coefficient glued directly onto the function name with no
// operator) is a real instance of the same MathML-to-LaTeX spacing defect,
// not a longer identifier — SAT/PSAT MathML content is equations, not
// English prose, so a bare multi-letter word this would misfire on
// ("titan", "instant") essentially never occurs inside a <math> element.
const BARE_FUNCTION_RE = new RegExp(`(?<!\\\\)(${BARE_FUNCTION_NAMES.join("|")})(?![a-z])`, "g");

// Longest-first so a shorter name never shadows a longer one at the same
// position (defensive; none of these actually share a prefix today).
const COMMAND_GLUE_RE = new RegExp(
  `\\\\(${[...KNOWN_COMMANDS].sort((a, b) => b.length - a.length).join("|")})(?=[a-zA-Z])`,
  "g",
);

// A literal, unescaped `$` always means currency in this corpus (never a
// math-mode delimiter) — but mathMlToLatex only escapes it inside an <mo>
// operator node (see OPERATOR_MAP), not inside <mtext>, so "$63" survives
// as a raw dollar sign and KaTeX rejects it as an unknown function.
const BARE_DOLLAR_RE = /(?<!\\)\$/g;

/** Insert the separator KaTeX needs between a known command and a glued identifier. */
export function applyLatexHygiene(tex: string): string {
  return tex
    .replace(BARE_FUNCTION_RE, "\\$1")
    .replace(COMMAND_GLUE_RE, "\\$1 ")
    .replace(BARE_DOLLAR_RE, "\\$$"); // "$$" is the replace()-string escape for a literal "$"
}
