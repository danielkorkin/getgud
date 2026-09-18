// Expression of Ideas (EOI) — Transitions (TRA) and Rhetorical Synthesis
// (SYN).
//
// These two skills are worth a guide of their own because they are the most
// mechanical questions in the Reading and Writing section and the ones
// students most often approach by ear. Both have an actual procedure, and
// the procedure beats intuition reliably enough to be worth learning.

import type { Guide } from "../spec";

export const TRANSITIONS_AND_SYNTHESIS: Guide = {
  id: "transitions-and-synthesis",
  title: "Transitions and rhetorical synthesis",
  kind: "strategy",
  summary:
    "Two question types with a real procedure. Transitions are about the logical relationship; synthesis is about the stated goal — in both cases, ignore what sounds smooth.",
  minutes: 8,
  tests: ["SAT", "PSAT"],
  sectionCode: "RW",
  domainCodes: ["EOI"],
  skillCodes: ["TRA", "SYN"],
  sections: [
    {
      heading: "Transitions: name the relationship first",
      blocks: [
        {
          kind: "text",
          content:
            "A transition question gives you a blank between two statements and four connecting words. The method is to work out the relationship between the two statements *before* looking at the choices, then pick the word that expresses it. Every choice sounds fine when read in place — that's the point of the design — so reading them aloud tells you nothing.",
        },
        {
          kind: "list",
          ordered: true,
          items: [
            "Cover the choices.",
            "Read the sentence before the blank. Summarize it in a few words.",
            "Read the sentence after. Summarize that.",
            "Decide the relationship: does the second agree, contrast, conclude, exemplify, or add?",
            "Only now look at the choices, and take the one matching that relationship.",
          ],
        },
        {
          kind: "table",
          columns: ["Relationship", "Words that signal it"],
          rows: [
            ["Contrast / reversal", "however, nevertheless, by contrast, on the other hand, still, conversely"],
            ["Cause and effect", "therefore, thus, consequently, as a result, hence"],
            ["Addition / continuation", "moreover, furthermore, in addition, also, similarly"],
            ["Example", "for example, for instance, specifically, in particular"],
            ["Concession", "admittedly, granted, to be sure, of course"],
            ["Emphasis or restatement", "indeed, in fact, that is, in other words"],
            ["Sequence in time", "subsequently, previously, meanwhile, eventually"],
          ],
        },
        {
          kind: "callout",
          tone: "warning",
          content:
            "The most common error is choosing a contrast word where the two statements actually agree. If the second sentence restates or extends the first, you need 'moreover', not 'however' — even though 'however' reads more like academic prose.",
        },
      ],
    },
    {
      heading: "Rhetorical synthesis: the goal is the whole question",
      blocks: [
        {
          kind: "text",
          content:
            "These questions give you a bulleted list of notes and a stated goal — something like 'to emphasize a similarity between the two studies' or 'to introduce the researcher's method to an audience unfamiliar with it'. Your job is to pick the sentence that accomplishes that specific goal using the given facts.",
        },
        {
          kind: "rules",
          items: [
            {
              rule: "Read the goal twice and hold onto its exact wording",
              detail:
                "Nearly every wrong answer is a grammatically fine, factually accurate sentence built from the notes — it just does something other than what the goal asked. The goal is the only criterion that matters.",
            },
            {
              rule: "Underline the operative verb in the goal",
              detail:
                "'Emphasize', 'compare', 'introduce', 'explain', 'contrast' — each demands a different sentence shape. A goal to emphasize a similarity is not met by a sentence that accurately lists both studies' findings without linking them.",
            },
            {
              rule: "Facts must come from the notes",
              detail: "A choice that adds information not in the bullets is wrong, however plausible it sounds.",
            },
            {
              rule: "Don't reward completeness",
              detail:
                "Using more of the notes does not make a choice better. The sentence that cites one bullet and hits the goal beats the one that cites four and doesn't.",
            },
          ],
        },
        {
          kind: "callout",
          tone: "tip",
          content:
            "These questions are slow by nature — there's a lot of text to process. That's fine: they're worth exactly as much as a one-line grammar question, so if you're running short on time, this is a reasonable type to guess on and come back to.",
        },
      ],
    },
  ],
  related: ["khan-sat-rw", "critical-reader-books", "yt-penguin-test-prep"],
};
