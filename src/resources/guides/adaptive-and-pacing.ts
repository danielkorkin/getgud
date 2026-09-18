// How the adaptive format works, and what it means for pacing.
//
// The per-question timings below are derived from the same numbers this
// app's own blueprints use (src/exams/sat-practice-1.ts: RW 32 minutes for
// 27 questions, Math 35 minutes for 22, a 10-minute break) — so this guide
// and the exam runner can't drift apart on the arithmetic.
//
// On the routing description: this stays deliberately vague about the
// threshold, because College Board routes on an IRT ability estimate that
// is not a raw-correct count. This app approximates it with a raw count
// (see the file comment in src/exams/scoring.ts, which is explicit that it
// is an approximation) and it would be wrong for a student-facing guide to
// present either number as the real cut.

import type { Guide } from "../spec";

export const ADAPTIVE_AND_PACING: Guide = {
  id: "adaptive-and-pacing",
  title: "How the adaptive test works, and how to pace it",
  kind: "strategy",
  summary:
    "Your first module decides which second module you get, and that decides your score ceiling. What that means for how you spend your time.",
  minutes: 7,
  tests: ["SAT", "PSAT"],
  featured: true,
  sections: [
    {
      heading: "The structure",
      blocks: [
        {
          kind: "table",
          columns: ["Section", "Shape"],
          rows: [
            ["Reading and Writing", "2 modules × 32 minutes, 27 questions each"],
            ["Break", "10 minutes between the sections"],
            ["Math", "2 modules × 35 minutes, 22 questions each"],
            ["Total testing time", "2 hours 14 minutes, plus the break"],
            ["Per question — Reading and Writing", "about 1 minute 11 seconds"],
            ["Per question — Math", "about 1 minute 35 seconds"],
          ],
        },
        {
          kind: "text",
          content:
            "Each section adapts independently. Your Reading and Writing performance has no effect on which Math module you get, and vice versa — so a weak first section does not cost you the second.",
        },
      ],
    },
    {
      heading: "What routing actually means",
      blocks: [
        {
          kind: "text",
          content:
            "After you submit the first module of a section, the test decides whether to give you a harder or an easier second module. Do well and you get the harder one; the harder module is the only path to the top of the scale. Get routed to the easier module and your score is capped well below 800 for that section, no matter how many of its questions you answer correctly.",
        },
        {
          kind: "callout",
          tone: "tip",
          content:
            "The practical consequence: the first module of each section is the high-leverage one. It's not weighted more heavily in the scoring itself — it's that it determines which scale you're scored on at all.",
        },
        {
          kind: "text",
          content:
            "College Board routes on a statistical ability estimate rather than a simple count of correct answers, and the exact cut isn't published. Treat 'do as well as you can on module 1' as the whole of the actionable advice — any specific number of questions you need is guesswork, including this app's own approximation of it.",
        },
      ],
    },
    {
      heading: "Pacing rules that survive contact with the clock",
      blocks: [
        {
          kind: "rules",
          items: [
            {
              rule: "Never leave a question blank",
              detail:
                "There is no penalty for a wrong answer. A blank and a wrong answer score identically, so a guess is free expected value. Before a module ends, make sure every question has something selected.",
            },
            {
              rule: "Every question is worth the same",
              detail:
                "A hard geometry problem and a one-line punctuation question count equally. Spending four minutes on the hard one to save a point you could have got elsewhere is a losing trade.",
            },
            {
              rule: "Flag and move at about 90 seconds",
              detail:
                "If you don't have a route to the answer in roughly a minute and a half, mark it, put down a guess, and move. Returning later with fresh eyes is cheap; grinding is not.",
            },
            {
              rule: "Do the whole module once, then come back",
              detail:
                "Questions are not strictly ordered by difficulty, so there's an easy question late in the module you'd never reach if you stalled in the middle. Get to the end, then spend what's left on the flagged ones.",
            },
            {
              rule: "Use the answer eliminator on anything you're unsure about",
              detail:
                "Crossing out two choices converts a blind guess into a coin flip. It also means that when you return to a flagged question, you don't redo the elimination work you already did.",
            },
            {
              rule: "You cannot go back to a submitted module",
              detail:
                "Once a module's time is up or you submit, it's closed. Anything you left unanswered stays unanswered — which is why the blank sweep has to happen before the clock runs out, not after.",
            },
          ],
        },
      ],
    },
    {
      heading: "The last two minutes",
      blocks: [
        {
          kind: "list",
          ordered: true,
          items: [
            "Stop working on the question in front of you.",
            "Check the question navigator for anything unanswered.",
            "Put a real guess on each one — eliminate what you can first, otherwise pick and move.",
            "Then go back to your flagged questions with whatever time is left.",
          ],
        },
        {
          kind: "callout",
          tone: "warning",
          content:
            "Practise this sweep under a real timer before test day. It sounds obvious and it is the most commonly skipped step, because at 1:30 remaining the instinct is to finish the hard problem instead.",
        },
      ],
    },
  ],
  related: ["cb-bluebook-app", "cb-whats-on-the-test", "yt-supertutortv", "cb-practice-tests-bluebook"],
};
