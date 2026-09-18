// Math formula cheat sheet.
//
// The organizing idea is the split between what Bluebook hands you and what
// it doesn't. Students routinely memorize the provided sheet (wasted
// effort) while missing the formulas that are genuinely absent — the
// quadratic formula, slope, the circle equation, exponent rules — so this
// guide leads with that distinction rather than listing formulas by topic.
//
// Everything in "given to you" was checked against College Board's own
// description of the reference sheet available in the testing app; if the
// app's reference sheet changes, this guide and
// src/components/practice/reference-sheet.tsx both need updating.

import type { Guide } from "../spec";

export const MATH_REFERENCE: Guide = {
  id: "math-reference",
  title: "Math formulas: what's given, what you must know",
  kind: "cheatsheet",
  summary:
    "The reference sheet covers less than you think. Here's what Bluebook provides, and the formulas you have to bring yourself.",
  minutes: 8,
  tests: ["SAT", "PSAT"],
  sectionCode: "MATH",
  domainCodes: ["H", "P", "Q", "S"],
  skillCodes: ["H.A.", "H.B.", "H.C.", "P.A.", "P.B.", "P.C.", "Q.A.", "Q.B.", "S.A.", "S.B.", "S.C.", "S.D."],
  featured: true,
  sections: [
    {
      heading: "Given to you in the app",
      blocks: [
        {
          kind: "text",
          content:
            "Bluebook's reference sheet is one click away during the whole Math section. Don't spend memorization effort here — spend it on the next section instead. What you do need is to know these exist, so you don't waste time re-deriving them.",
        },
        {
          kind: "formulas",
          items: [
            { name: "Area of a circle", latex: "A = \\pi r^2" },
            { name: "Circumference", latex: "C = 2\\pi r" },
            { name: "Area of a rectangle", latex: "A = \\ell w" },
            { name: "Area of a triangle", latex: "A = \\tfrac{1}{2} b h" },
            { name: "Pythagorean theorem", latex: "c^2 = a^2 + b^2" },
            { name: "45-45-90 triangle", latex: "x,\\; x,\\; x\\sqrt{2}", note: "Sides opposite 45°, 45°, 90°." },
            { name: "30-60-90 triangle", latex: "x,\\; x\\sqrt{3},\\; 2x", note: "Sides opposite 30°, 60°, 90°." },
            { name: "Volume of a rectangular prism", latex: "V = \\ell w h" },
            { name: "Volume of a cylinder", latex: "V = \\pi r^2 h" },
            { name: "Volume of a sphere", latex: "V = \\tfrac{4}{3}\\pi r^3" },
            { name: "Volume of a cone", latex: "V = \\tfrac{1}{3}\\pi r^2 h" },
            { name: "Volume of a pyramid", latex: "V = \\tfrac{1}{3}\\ell w h" },
            { name: "Degrees in a circle", latex: "360^\\circ = 2\\pi \\text{ radians}" },
            { name: "Angles in a triangle", latex: "180^\\circ" },
          ],
        },
      ],
    },
    {
      heading: "Not given — memorize these",
      blocks: [
        {
          kind: "text",
          content:
            "This is the list that actually matters. Every formula below appears on the test regularly and none of them are on the reference sheet.",
        },
        {
          kind: "formulas",
          items: [
            { name: "Slope from two points", latex: "m = \\frac{y_2 - y_1}{x_2 - x_1}" },
            { name: "Slope-intercept form", latex: "y = mx + b", note: "b is the y-intercept — the value when x = 0." },
            { name: "Point-slope form", latex: "y - y_1 = m(x - x_1)", note: "Fastest way to write a line through a known point." },
            { name: "Distance between two points", latex: "d = \\sqrt{(x_2-x_1)^2 + (y_2-y_1)^2}" },
            { name: "Midpoint", latex: "\\left(\\frac{x_1+x_2}{2},\\; \\frac{y_1+y_2}{2}\\right)" },
            { name: "Quadratic formula", latex: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}" },
            { name: "Discriminant", latex: "b^2 - 4ac", note: "Positive → 2 real solutions; zero → 1; negative → none." },
            { name: "Vertex form", latex: "y = a(x-h)^2 + k", note: "Vertex at (h, k). The fastest route to a minimum or maximum question." },
            { name: "Axis of symmetry / vertex x-coordinate", latex: "x = -\\frac{b}{2a}" },
            { name: "Sum and product of roots", latex: "r_1 + r_2 = -\\frac{b}{a},\\quad r_1 r_2 = \\frac{c}{a}" },
            { name: "Equation of a circle", latex: "(x-h)^2 + (y-k)^2 = r^2", note: "Center (h, k), radius r. Often needs completing the square first." },
            { name: "Percent change", latex: "\\frac{\\text{new} - \\text{old}}{\\text{old}} \\times 100\\%" },
            { name: "Exponential growth / decay", latex: "y = a(1 \\pm r)^t", note: "Growth uses +r, decay uses −r; a is the starting amount." },
            { name: "Mean", latex: "\\bar{x} = \\frac{\\text{sum of values}}{\\text{number of values}}" },
            { name: "Probability", latex: "P = \\frac{\\text{favorable outcomes}}{\\text{total outcomes}}" },
            { name: "SOHCAHTOA", latex: "\\sin\\theta = \\tfrac{o}{h},\\quad \\cos\\theta = \\tfrac{a}{h},\\quad \\tan\\theta = \\tfrac{o}{a}" },
            { name: "Arc length", latex: "s = r\\theta", note: "θ in radians." },
            { name: "Sector area", latex: "A = \\tfrac{1}{2} r^2 \\theta", note: "θ in radians." },
          ],
        },
      ],
    },
    {
      heading: "Exponent and radical rules",
      blocks: [
        {
          kind: "text",
          content:
            "Not on the reference sheet, and the single most common source of algebra errors on equivalent-expression questions.",
        },
        {
          kind: "formulas",
          items: [
            { name: "Product of powers", latex: "x^a \\cdot x^b = x^{a+b}" },
            { name: "Quotient of powers", latex: "\\frac{x^a}{x^b} = x^{a-b}" },
            { name: "Power of a power", latex: "(x^a)^b = x^{ab}" },
            { name: "Negative exponent", latex: "x^{-a} = \\frac{1}{x^a}" },
            { name: "Zero exponent", latex: "x^0 = 1", note: "For any x ≠ 0." },
            { name: "Fractional exponent", latex: "x^{a/b} = \\sqrt[b]{x^a}" },
            { name: "Difference of squares", latex: "a^2 - b^2 = (a+b)(a-b)" },
            { name: "Perfect square trinomials", latex: "(a \\pm b)^2 = a^2 \\pm 2ab + b^2" },
          ],
        },
        {
          kind: "callout",
          tone: "warning",
          content:
            "The error to watch: (a + b)² is not a² + b². Expanding it wrong is one of the most reliably punished mistakes in the Advanced Math domain, because the wrong answer it produces is usually an available choice.",
        },
      ],
    },
    {
      heading: "Linear equations: what the question is really asking",
      blocks: [
        {
          kind: "table",
          columns: ["The question says", "What it wants"],
          rows: [
            ["\"No solution\" (system of two lines)", "Same slope, different intercepts — parallel lines"],
            ["\"Infinitely many solutions\"", "Same slope and same intercept — the same line twice"],
            ["\"Exactly one solution\"", "Different slopes"],
            ["\"Perpendicular\"", "Slopes multiply to −1 (negative reciprocals)"],
            ["\"Rate of change\" or \"per\"", "The slope"],
            ["\"Initial value\" or \"starting amount\"", "The y-intercept, i.e. the constant term"],
            ["\"x-intercept\" / \"zero\" / \"root\"", "Set y = 0 and solve"],
          ],
        },
      ],
    },
  ],
  related: ["desmos-collegeboard-graphing", "khan-sat-math", "yt-scalar-learning", "college-panda"],
};
