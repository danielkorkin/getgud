// Study planning.
//
// Written to be honest about the thing most study-plan content isn't: the
// review pass matters more than the volume of questions, and a plan that
// only allocates practice time will produce a plateau. The plans here
// deliberately allocate less time to new questions than most published
// schedules do.
//
// Cross-references this app's own features where they're genuinely the
// right tool, without pretending it replaces official practice in Bluebook.

import type { Guide } from "../spec";

export const STUDY_PLAN: Guide = {
  id: "study-plan",
  title: "Building a study plan that works",
  kind: "plan",
  summary:
    "How to turn a test date into a weekly schedule — and why reviewing what you missed matters more than doing more questions.",
  minutes: 9,
  tests: ["SAT", "PSAT"],
  featured: true,
  sections: [
    {
      heading: "Start with a real diagnostic",
      blocks: [
        {
          kind: "text",
          content:
            "Take one full-length adaptive test in Bluebook before you study anything. Not a section, not an untimed set — a full test under real conditions. Everything else in your plan depends on knowing which domains are actually costing you points, and you cannot get that from a feeling about which subjects you like.",
        },
        {
          kind: "callout",
          tone: "tip",
          content:
            "Do this even if it feels premature. A diagnostic taken before you're 'ready' is more useful than an accurate score taken three weeks in, because it's what tells you what to spend those three weeks on.",
        },
      ],
    },
    {
      heading: "The review pass is the actual studying",
      blocks: [
        {
          kind: "text",
          content:
            "Most people's plans are almost entirely question volume, which is why they plateau. Doing a question teaches you very little; understanding why you missed one teaches you a lot. Budget at least as much time for review as for practice.",
        },
        {
          kind: "list",
          ordered: true,
          items: [
            "For every miss, write down which of three things happened: you didn't know the content, you knew it and made an error, or you ran out of time.",
            "Content gap → go learn the topic. A question is not a lesson; go to the course or the cheat sheet.",
            "Careless error → find the pattern. The same three or four mistakes usually account for most of them, and naming them is what makes them stop.",
            "Timing → that's a pacing problem, not a knowledge problem. Practise the flag-and-move habit rather than studying more content.",
          ],
        },
        {
          kind: "callout",
          tone: "warning",
          content:
            "If you can't say which of those three it was, you haven't finished reviewing that question yet. 'I just got it wrong' is not a diagnosis, and it's the reason the same question type keeps coming back.",
        },
      ],
    },
    {
      heading: "Eight weeks out",
      blocks: [
        {
          kind: "table",
          columns: ["Week", "Focus"],
          rows: [
            ["1", "Full diagnostic test. Review it thoroughly. Identify your two weakest domains."],
            ["2–3", "Content work on those two domains. Short targeted question sets, heavy review. No full tests."],
            ["4", "Second full test. Compare domain by domain against week 1 — has the needle moved?"],
            ["5–6", "Next two weakest domains. Keep the first two alive with a small weekly set so they don't decay."],
            ["7", "Third full test. Focus review on timing and the last-two-minutes sweep rather than content."],
            ["8", "Light review of your own error log. No new material. Sleep."],
          ],
        },
      ],
    },
    {
      heading: "Two weeks out",
      blocks: [
        {
          kind: "text",
          content:
            "A short runway changes the goal: you are no longer trying to learn the test, you're trying to stop leaking points you already know how to keep.",
        },
        {
          kind: "list",
          items: [
            "One full test in the first few days, reviewed properly.",
            "Grammar rules — the highest points-per-hour on the test, because it's a closed rule set.",
            "The formulas that aren't on the reference sheet. Pure memorization, immediate payoff.",
            "Desmos, if you haven't used the test build. An hour here can be worth several points on Math.",
            "One more full test roughly four days out, then stop taking tests.",
            "Final days: re-read your own error log. Don't start anything new.",
          ],
        },
      ],
    },
    {
      heading: "How to use this app in a plan",
      blocks: [
        {
          kind: "list",
          items: [
            "Practice sets (/new) — targeted drilling by domain, skill, and difficulty. This is the tool for weeks 2–3 and 5–6, when you're working a specific weakness.",
            "Practice tests (/tests) — full-length, timed, adaptive, for the milestone weeks. Same test on every copy of Getgud, so a score here is comparable across attempts.",
            "The results screen's by-skill breakdown — where your error log comes from. Each weak skill links straight back into this Learn section.",
            "Strobi, the coach — use the hint ladder while learning a question type, and turn to the post-answer chat during review rather than during practice.",
          ],
        },
        {
          kind: "callout",
          tone: "tip",
          content:
            "Take at least one full-length test in Bluebook itself, whatever else you do. This app reproduces the structure of the adaptive test, but test day happens in College Board's app, and the interface should not be new to you.",
        },
      ],
    },
  ],
  related: ["cb-build-study-plan", "cb-bluebook-app", "khan-digital-sat", "schoolhouse-sat-bootcamp", "cb-dates-deadlines"],
};
