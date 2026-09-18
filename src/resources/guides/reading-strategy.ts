// Reading question strategy — the Information and Ideas (INI) and Craft and
// Structure (CAS) domains.
//
// Organized by question type rather than by passage type, because the
// digital format gives one short passage per question: there is no
// long-passage-with-ten-questions to strategize around any more, and advice
// written for the pre-2024 paper test consistently gets this wrong.

import type { Guide } from "../spec";

export const READING_STRATEGY: Guide = {
  id: "reading-strategy",
  title: "Reading questions, type by type",
  kind: "strategy",
  summary:
    "One short passage per question changes how you read. What each reading question type is really asking, and the trap answer each one has.",
  minutes: 11,
  tests: ["SAT", "PSAT"],
  sectionCode: "RW",
  domainCodes: ["INI", "CAS"],
  skillCodes: ["CID", "COE", "INF", "CTC", "TSP", "WIC"],
  featured: true,
  sections: [
    {
      heading: "The format changes the strategy",
      blocks: [
        {
          kind: "text",
          content:
            "Each Reading and Writing question comes with its own short passage — typically 25 to 150 words. Nothing carries over between questions, so skimming for later payoff is pointless. Read the passage properly once; it's short enough that you can.",
        },
        {
          kind: "callout",
          tone: "tip",
          content:
            "Read the question before the passage. Knowing whether you're looking for a main idea, a specific detail, or a logical gap changes what you notice on a single read — and a single read is all the time allows.",
        },
      ],
    },
    {
      heading: "Central Ideas and Details",
      blocks: [
        {
          kind: "rules",
          items: [
            {
              rule: "Main idea questions want the whole passage, not its most interesting sentence",
              detail:
                "The trap answer is always true and always too narrow — a real detail from one sentence, offered as if it were the point. Ask whether the choice covers the passage from start to finish.",
            },
            {
              rule: "Detail questions are open-book",
              detail:
                "The answer is stated in the text. If you're reasoning about what's probably true, you're on the wrong question type — go back and find the line.",
            },
          ],
        },
      ],
    },
    {
      heading: "Inferences",
      blocks: [
        {
          kind: "rules",
          items: [
            {
              rule: "The correct inference is the smallest possible step",
              detail:
                "These questions have a reputation for being subjective; they aren't. The right answer is the one the text forces. If a choice requires outside knowledge or one more assumption, it's wrong however reasonable it sounds.",
            },
            {
              rule: "Blank-completion inferences follow the logical connector",
              detail:
                "When the passage ends mid-thought with a blank, look at the signal word before it. 'However' means the blank reverses what came before; 'therefore' means it follows from it. That single word usually eliminates two choices.",
            },
          ],
        },
      ],
    },
    {
      heading: "Command of Evidence",
      blocks: [
        {
          kind: "rules",
          items: [
            {
              rule: "Textual evidence: find the claim first",
              detail:
                "The question names a hypothesis or argument. Write down — in your own words — what would have to be true for it to hold. Then find the choice that supplies exactly that. Going to the choices first invites you to rationalize each one.",
            },
            {
              rule: "Quantitative evidence: the graph is not the question",
              detail:
                "With a table or chart, the right answer must do two things at once: accurately describe the data, and support the specific claim in the text. The classic trap reads the graph correctly but supports nothing the passage argues.",
              example: "Check both halves of the choice separately. A choice that misreads the axis is out; a choice that reads it right but is irrelevant is also out.",
            },
          ],
        },
      ],
    },
    {
      heading: "Words in Context",
      blocks: [
        {
          kind: "rules",
          items: [
            {
              rule: "Predict before you look",
              detail:
                "Cover the choices, read the sentence, and say what word you'd put in the blank. Then find the closest choice. This is the single highest-value habit in the section, because all four choices are usually real words that fit the grammar.",
            },
            {
              rule: "The tested meaning is often the secondary one",
              detail:
                "When a familiar word appears, the question is usually about a less common sense of it. If the obvious meaning fits suspiciously well, check the others.",
            },
            {
              rule: "Match connotation, not just definition",
              detail:
                "Two choices can share a denotation while differing in whether they're approving or critical. The passage's attitude decides between them.",
            },
          ],
        },
      ],
    },
    {
      heading: "Text Structure and Purpose",
      blocks: [
        {
          kind: "rules",
          items: [
            {
              rule: "Purpose questions ask what a sentence does, not what it says",
              detail:
                "Correct answers are phrased as functions — 'introduces a counterargument', 'illustrates a claim', 'qualifies a finding'. A choice that accurately paraphrases the content while misdescribing its role is wrong.",
            },
            {
              rule: "For an underlined-sentence question, read what surrounds it",
              detail: "A sentence's job is defined by its neighbours. Read the sentence before and after before deciding.",
            },
          ],
        },
      ],
    },
    {
      heading: "Cross-Text Connections",
      blocks: [
        {
          kind: "rules",
          items: [
            {
              rule: "Pin down each author's position separately",
              detail:
                "Before reading the choices, state Text 1's claim and Text 2's claim in a few words each. Most wrong answers misattribute — they give you a position one author holds and assign it to the other.",
            },
            {
              rule: "Disagreement is usually narrow",
              detail:
                "Two texts rarely disagree about everything. Find the specific point of contention; choices that overstate the conflict are the common trap.",
            },
          ],
        },
      ],
    },
  ],
  related: ["critical-reader-blog", "critical-reader-books", "khan-sat-rw", "yt-penguin-test-prep"],
};
