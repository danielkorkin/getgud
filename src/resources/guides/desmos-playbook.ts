// Desmos strategy for the digital SAT.
//
// Framed as "which question shapes convert into a graphing problem" rather
// than "here are Desmos features", because the feature list is discoverable
// in thirty seconds and the conversion is the actual skill. The closing
// section on when *not* to use it is not filler — reaching for the
// calculator on arithmetic is a common way to lose time on a section that
// is already tight.

import type { Guide } from "../spec";

export const DESMOS_PLAYBOOK: Guide = {
  id: "desmos-playbook",
  title: "The Desmos playbook",
  kind: "strategy",
  summary:
    "A graphing calculator is built into the test. Most algebra questions can be turned into a graph — here's which ones, and when to skip it.",
  minutes: 9,
  tests: ["SAT", "PSAT"],
  sectionCode: "MATH",
  domainCodes: ["H", "P", "Q", "S"],
  skillCodes: ["H.A.", "H.B.", "H.C.", "H.D.", "H.E.", "P.B.", "P.C.", "Q.D.", "S.D."],
  featured: true,
  sections: [
    {
      heading: "The core move: graph both sides",
      blocks: [
        {
          kind: "text",
          content:
            "Any equation can become an intersection problem. Instead of rearranging and solving, type the left side as one function and the right side as another, then read off where they cross. This works no matter how ugly the algebra looks, and it does not care whether the equation is linear, quadratic, exponential, or none of those.",
        },
        {
          kind: "list",
          ordered: true,
          items: [
            "Type the left side as y = (whatever it is).",
            "Type the right side as a second equation.",
            "Click the intersection point — Desmos labels the coordinates exactly.",
            "Read whichever coordinate the question asked for. Check whether it wanted x or y before you answer.",
          ],
        },
        {
          kind: "callout",
          tone: "tip",
          content:
            "For a system of two equations, this is the whole method: type both, click the intersection, done. No substitution, no elimination, no sign errors.",
        },
      ],
    },
    {
      heading: "Question shapes that convert cleanly",
      blocks: [
        {
          kind: "table",
          columns: ["When the question asks for", "Do this in Desmos"],
          rows: [
            ["Solutions / roots / zeros / x-intercepts", "Graph it and click where the curve meets the x-axis"],
            ["The solution to a system", "Graph both equations, click the intersection"],
            ["A vertex, minimum, or maximum", "Graph it and click the turning point — Desmos labels it"],
            ["The value of a parameter that makes something true", "Add a slider for the parameter and drag until the condition holds"],
            ["\"How many solutions does this have?\"", "Graph and count intersections"],
            ["A line of best fit for a table of data", "Enter the table, then add y₁ ~ mx₁ + b for the regression"],
            ["Mean, median, or standard deviation of a list", "Use mean(), median(), stdev() on a list in brackets"],
            ["A circle's center or radius", "Type the equation as given — Desmos graphs it without completing the square"],
            ["Where two curves are equal", "Graph both, click intersections"],
            ["A system of inequalities", "Type both with < or >; the overlapping shaded region is the solution set"],
          ],
        },
      ],
    },
    {
      heading: "Techniques worth practising before test day",
      blocks: [
        {
          kind: "rules",
          items: [
            {
              rule: "Sliders for unknown coefficients",
              detail:
                "Type a letter Desmos doesn't recognize as a function and it offers to add a slider. This turns 'find the value of k such that...' into dragging until the graph does what the question describes.",
              example: "For \"the system has no solution\", graph both with a slider on k and drag until the lines become parallel.",
            },
            {
              rule: "Tables for data questions",
              detail: "Click the + and choose 'table' to enter paired values, then fit a regression to them. Faster and less error-prone than computing a line of best fit by hand.",
            },
            {
              rule: "Regression syntax",
              detail: "With a table of x₁ and y₁, typing y₁ ~ mx₁ + b gives you m and b directly. Use y₁ ~ ax₁² + bx₁ + c for a quadratic fit.",
            },
            {
              rule: "Restrict a domain with braces",
              detail: "Adding {0 < x < 10} after a function limits where it draws — useful when a word problem only makes sense over part of the range.",
            },
            {
              rule: "Zoom deliberately",
              detail:
                "The default window hides intersections that sit far from the origin. If you expect a crossing and don't see one, zoom out before concluding there isn't one.",
            },
          ],
        },
      ],
    },
    {
      heading: "When not to reach for it",
      blocks: [
        {
          kind: "text",
          content:
            "Desmos is not free. Typing an expression costs ten to twenty seconds, and on a module where you have a bit over a minute per question, that matters. Some questions are simply faster by hand.",
        },
        {
          kind: "list",
          items: [
            "Plain arithmetic and one-step algebra — just do it.",
            "Questions asking for an expression rather than a value: if the answer choices are algebraic, you usually need the manipulation, not a number.",
            "Geometry questions about relationships (similar triangles, angle chasing) where nothing is graphable.",
            "Anything where you already see the method — a confident hand method beats a calculator detour.",
          ],
        },
        {
          kind: "callout",
          tone: "warning",
          content:
            "Practise in the College Board build of Desmos, not the standard web app. The test version has a different feature set, and finding that out during the exam is a bad way to spend your first Math module.",
        },
      ],
    },
  ],
  related: ["desmos-collegeboard-graphing", "cb-bluebook-how-to", "yt-scalar-learning", "desmos-testing"],
};
