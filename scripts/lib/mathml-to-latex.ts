// Convert a MathML document to LaTeX. Scoped to the tag vocabulary actually
// observed in this corpus's embedded/native MathML (both the PNG-embedded
// source from scripts/lib/png-mathml.ts and College Board's own <math> tags
// in qbank stem/rationale HTML use the same small vocabulary). Structured
// XML, unlike prose — a real tree, not a language-ambiguity problem — so
// this is a straightforward, high-confidence deterministic conversion.
// Unknown tags/operators still convert (best-effort passthrough) but flag
// the result as low-confidence rather than pretend certainty.

import { decodeHtmlEntities } from "./html";
import { isElement, parseXml, type XmlElement, type XmlNode } from "./xml";

export interface MathMlConversion {
  latex: string;
  confidence: "high" | "low";
  warnings: string[];
}

const OPERATOR_MAP: Record<string, string> = {
  "−": "-", // minus sign
  "×": "\\times",
  "÷": "\\div",
  "⋅": "\\cdot",
  "·": "\\cdot",
  "≤": "\\leq",
  "≥": "\\geq",
  "≠": "\\neq",
  "±": "\\pm",
  "→": "\\rightarrow",
  "∞": "\\infty",
  "(": "(",
  ")": ")",
  "+": "+",
  "-": "-",
  "=": "=",
  "<": "<",
  ">": ">",
  ".": ".",
  ",": ",",
  "|": "|", // bare absolute-value bar; correct as-is in LaTeX math mode
  "$": "\\$", // LaTeX reserves bare `$` for math-mode delimiters
  "%": "\\%",
  "&": "\\&",
  "#": "\\#",
  "π": "\\pi",
  "°": "^{\\circ}", // bare degree sign
  "∘": "\\circ", // ring operator, used as the content of a degree exponent (<msup>...°</msup>)
  "∠": "\\angle",
  "△": "\\triangle",
  "∆": "\\triangle", // "increment" glyph, used interchangeably with △ for triangle notation here
  "/": "/",
  "≈": "\\approx",
  "⁢": "", // INVISIBLE TIMES — implicit multiplication, e.g. "4(276)"
  "⁡": "", // INVISIBLE FUNCTION APPLICATION, e.g. "f(x)"
};

// Combining diacritics used as the accent operand of <mover>/<munder> — not
// real operators, just markers for which accent to apply to the base.
const OVERLINE_MARKS = new Set(["¯", "―", "─", "-"]); // macron / overline variants

/** Merge runs of [mn, mtext(","), mn, ...] into one literal number — College
 * Board's renderer splits large numbers like "2,300" across sibling nodes
 * with the comma as a separate <mtext>. */
function mergeDigitGroups(children: XmlNode[]): XmlNode[] {
  const out: XmlNode[] = [];
  let i = 0;
  while (i < children.length) {
    const node = children[i];
    if (
      isElement(node) &&
      node.tag === "mn" &&
      i + 2 < children.length &&
      isElement(children[i + 1]) &&
      (children[i + 1] as XmlElement).tag === "mtext" &&
      isElement(children[i + 2]) &&
      (children[i + 2] as XmlElement).tag === "mn"
    ) {
      let text = textContent(node);
      let j = i;
      while (
        j + 2 < children.length &&
        isElement(children[j + 1]) &&
        (children[j + 1] as XmlElement).tag === "mtext" &&
        isElement(children[j + 2]) &&
        (children[j + 2] as XmlElement).tag === "mn"
      ) {
        text += textContent(children[j + 1] as XmlElement) + textContent(children[j + 2] as XmlElement);
        j += 2;
      }
      out.push({ tag: "mn", attrs: {}, children: [text] });
      i = j + 1;
    } else {
      out.push(node);
      i++;
    }
  }
  return out;
}

function textContent(node: XmlNode): string {
  if (!isElement(node)) return node;
  return node.children.map(textContent).join("");
}

class Converter {
  warnings: string[] = [];

  convert(node: XmlNode): string {
    if (!isElement(node)) return node;
    switch (node.tag) {
      case "math":
      case "mrow":
      case "mstyle":
      case "p":
        return this.convertChildren(node.children);
      case "mi":
      case "mn": {
        const text = this.convertChildren(node.children);
        return text;
      }
      case "mo": {
        const raw = this.convertChildren(node.children);
        const text = raw.trim();
        // A non-breaking space (or other whitespace) used as a plain word
        // separator, e.g. inside a unit label like "miles per hour" spread
        // across sibling <mtext>/<mo> nodes — not a real operator.
        if (text === "" && raw.length > 0) return " ";
        if (text in OPERATOR_MAP) return OPERATOR_MAP[text];
        // A bare numeric literal occasionally lands on <mo> instead of <mn>
        // (an upstream MathML-generation quirk) — still an exact, unambiguous
        // passthrough, not a guess.
        if (/^-?[\d.,]+$/.test(text)) return text;
        this.warnings.push(`unmapped operator: ${JSON.stringify(text)}`);
        return text;
      }
      case "mtext":
        return this.convertChildren(node.children);
      case "mspace":
        return "\\;";
      case "msub": {
        const [base, sub] = node.children;
        return `{${this.convert(base)}}_{${this.convert(sub)}}`;
      }
      case "msup": {
        const [base, sup] = node.children;
        const supAccentText = decodeHtmlEntities(textContent(sup)).trim();
        if (supAccentText === "'" || supAccentText === "′") {
          // "T prime" rendered as <msup><mi>T</mi><mo>'</mo></msup> — a prime
          // mark, not a literal superscript of a quote character.
          return `{${this.convert(base)}}'`;
        }
        return `{${this.convert(base)}}^{${this.convert(sup)}}`;
      }
      case "msubsup": {
        const [base, sub, sup] = node.children;
        return `{${this.convert(base)}}_{${this.convert(sub)}}^{${this.convert(sup)}}`;
      }
      case "mfrac": {
        const [num, den] = node.children;
        return `\\frac{${this.convert(num)}}{${this.convert(den)}}`;
      }
      case "msqrt":
        return `\\sqrt{${this.convertChildren(node.children)}}`;
      case "mroot": {
        const [base, index] = node.children;
        return `\\sqrt[${this.convert(index)}]{${this.convert(base)}}`;
      }
      case "mover": {
        const [base, accent] = node.children;
        const accentText = decodeHtmlEntities(textContent(accent)).trim();
        if (OVERLINE_MARKS.has(accentText)) {
          // Line-segment notation, e.g. <mover><mrow>E G</mrow>¯</mover> -> \overline{EG}
          return `\\overline{${this.convert(base)}}`;
        }
        this.warnings.push(`unrecognized mover accent: ${JSON.stringify(accentText)}`);
        return `\\overset{${this.convert(accent)}}{${this.convert(base)}}`;
      }
      case "mfenced": {
        const open = node.attrs.open ?? "(";
        const close = node.attrs.close ?? ")";
        const sep = node.attrs.separators ?? ",";
        const inner = node.children.map((c) => this.convert(c)).join(sep[0] ?? ",");
        return `\\left${escapeDelimiter(open)} ${inner} \\right${escapeDelimiter(close)}`;
      }
      case "mtable": {
        const rows = node.children.filter(isElement).map((row) => this.convert(row));
        return `\\begin{aligned} ${rows.join(" \\\\ ")} \\end{aligned}`;
      }
      case "mtr": {
        const cells = node.children.filter(isElement).map((cell) => this.convert(cell));
        return cells.join(" & ");
      }
      case "mtd":
        return this.convertChildren(node.children);
      case "menclose": {
        const notation = node.attrs.notation ?? "";
        if (notation.includes("top")) {
          return `\\overline{${this.convertChildren(node.children)}}`;
        }
        this.warnings.push(`unrecognized menclose notation: ${JSON.stringify(notation)}`);
        return this.convertChildren(node.children);
      }
      default:
        this.warnings.push(`unknown tag: <${node.tag}>`);
        return this.convertChildren(node.children);
    }
  }

  private convertChildren(children: XmlNode[]): string {
    return mergeDigitGroups(children)
      .map((c) => this.convert(c))
      .join("");
  }
}

function escapeDelimiter(d: string): string {
  if (d === "") return ".";
  if (d === "|") return "|";
  return d;
}

export function mathMlToLatex(mathml: string): MathMlConversion {
  const root = parseXml(mathml);
  const converter = new Converter();
  const latex = converter.convert(root);
  return {
    latex,
    confidence: converter.warnings.length === 0 ? "high" : "low",
    warnings: converter.warnings,
  };
}
