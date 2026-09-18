// Standard English Conventions cheat sheet — the SEC domain (BOU + FSS).
//
// This is the most learnable domain on the whole test: it's a closed set of
// rules, the same handful recur, and unlike reading questions there is
// always a single defensible answer. Written rule-first rather than
// question-first for that reason.
//
// Deliberately excludes rules that English teachers care about but the SAT
// never tests (the Oxford comma, split infinitives, ending on a
// preposition) — listing them would imply they're worth checking, and
// checking them costs time.

import type { Guide } from "../spec";

export const GRAMMAR_RULES: Guide = {
  id: "grammar-rules",
  title: "Every grammar rule the SAT actually tests",
  kind: "cheatsheet",
  summary:
    "Standard English Conventions is a closed set of rules with one right answer each — the most learnable points on the test.",
  minutes: 12,
  tests: ["SAT", "PSAT"],
  sectionCode: "RW",
  domainCodes: ["SEC"],
  skillCodes: ["BOU", "FSS"],
  featured: true,
  sections: [
    {
      heading: "First, find the independent clauses",
      blocks: [
        {
          kind: "text",
          content:
            "Almost every punctuation question is really one question: how many complete sentences are in here, and how are they being joined? An independent clause has a subject and a verb and could stand alone as a sentence. Identify those before you look at the answer choices, because the choices are designed to look plausible until you know the clause structure.",
        },
        {
          kind: "rules",
          items: [
            {
              rule: "Two independent clauses cannot be joined by a comma alone",
              detail:
                "This is a comma splice, and it is always wrong on this test. Your legal joiners are: a period, a semicolon, a colon (if the second clause explains the first), a dash, or a comma plus one of the FANBOYS conjunctions.",
              example: "Wrong: The results were clear, the hypothesis was confirmed. → Right: The results were clear; the hypothesis was confirmed.",
            },
            {
              rule: "A semicolon works exactly like a period",
              detail:
                "Independent clause on both sides, always. This makes semicolon questions easy: if you could put a period there, the semicolon is fine; if you couldn't, it's wrong. Note that 'however', 'therefore', and 'moreover' are not conjunctions — they need a semicolon or period before them, not a comma.",
              example: "Wrong: The trial failed, however the data was useful. → Right: The trial failed; however, the data was useful.",
            },
            {
              rule: "A colon needs a complete sentence before it",
              detail:
                "What comes after can be a list, a phrase, or another clause — that part is flexible. What matters is that the material before the colon stands alone.",
              example: "Wrong: The team studied: mice, rats, and voles. → Right: The team studied three rodents: mice, rats, and voles.",
            },
            {
              rule: "FANBOYS: for, and, nor, but, or, yet, so",
              detail: "These are the only coordinating conjunctions that can join two independent clauses with a comma in front.",
            },
            {
              rule: "No comma between subject and verb",
              detail:
                "Long subjects tempt you into a pause that sounds natural out loud but is wrong on paper. If you can strip the sentence to 'X did Y', no comma belongs between X and did.",
              example: "Wrong: The scientist who first described the species, published in 1893.",
            },
          ],
        },
      ],
    },
    {
      heading: "Non-essential information",
      blocks: [
        {
          kind: "rules",
          items: [
            {
              rule: "Punctuation around an interrupter must match on both sides",
              detail:
                "If a phrase can be deleted without breaking the sentence or changing which thing you mean, it gets surrounded — two commas, two dashes, or two parentheses. Never one comma and one dash.",
              example: "Right: The paper, published in 1893, changed the field. (Delete the middle: the sentence still works.)",
            },
            {
              rule: "The deletion test settles it",
              detail:
                "Read the sentence with the phrase removed. Still a complete, sensible sentence that refers to the same thing? Then it's non-essential and needs the matched pair. If removing it leaves you unable to tell what's being discussed, it's essential and takes no commas.",
            },
          ],
        },
      ],
    },
    {
      heading: "Verbs",
      blocks: [
        {
          kind: "rules",
          items: [
            {
              rule: "A verb agrees with its subject, not with the nearest noun",
              detail:
                "The test's standard trick is to bury a prepositional phrase between the two. Cross out everything between the subject and the verb, then check.",
              example: "The collection of rare manuscripts is (not are) valuable. → Subject is 'collection', singular.",
            },
            {
              rule: "Watch for the inverted sentence",
              detail:
                "In sentences beginning with 'there is/are' or with a prepositional phrase, the subject comes after the verb. Find the real subject before deciding on singular or plural.",
              example: "Among the findings are (not is) three unexplained results. → Subject is 'results'.",
            },
            {
              rule: "Tense follows the passage, not the sentence",
              detail:
                "When a verb-tense question has choices in several tenses, the answer comes from the surrounding sentences and any date markers. Look outside the underlined sentence — the information you need is almost never inside it.",
            },
          ],
        },
      ],
    },
    {
      heading: "Pronouns, apostrophes, and the ones people lose points on",
      blocks: [
        {
          kind: "rules",
          items: [
            {
              rule: "its vs it's",
              detail: "'its' is possessive. \"it's\" is a contraction of 'it is' or 'it has'. There is no such word as 'its''.",
              example: "The theory lost its appeal. / It's been revised twice.",
            },
            {
              rule: "their vs there vs they're",
              detail: "Possessive / place or existence / 'they are'. Expand the contraction to check.",
            },
            {
              rule: "Singular possessive vs plural possessive",
              detail:
                "One owner: apostrophe then s ('the scientist's data'). Multiple owners: s then apostrophe ('the scientists' data'). Plural with no possession: no apostrophe at all ('the scientists agreed').",
            },
            {
              rule: "who vs whom",
              detail: "'who' is the subject, 'whom' is the object. Substitute he/him: if 'him' fits, use 'whom'.",
            },
            {
              rule: "A pronoun must have exactly one thing it could refer to",
              detail:
                "If a sentence has two plural nouns and then 'they', the reference is ambiguous and the answer will be the choice that names the noun outright.",
            },
          ],
        },
      ],
    },
    {
      heading: "Modifiers and parallelism",
      blocks: [
        {
          kind: "rules",
          items: [
            {
              rule: "A modifying phrase attaches to whatever follows the comma",
              detail:
                "When a sentence opens with a descriptive phrase, the thing being described has to be the subject of the main clause. If it isn't, the modifier dangles — and the fix is usually the choice that reorders the sentence, not one that adds punctuation.",
              example:
                "Wrong: Having studied the data for years, the conclusion was obvious. (The conclusion didn't study anything.) → Right: Having studied the data for years, she found the conclusion obvious.",
            },
            {
              rule: "Items in a list must share a grammatical form",
              detail:
                "All nouns, all -ing verbs, or all infinitives — don't mix. Read the list against the words that introduce it.",
              example: "Wrong: hiking, swimming, and to ride bikes → Right: hiking, swimming, and riding bikes",
            },
            {
              rule: "Comparisons must be between like things",
              detail: "Compare a number to a number, a rate to a rate, a person's work to another person's work — not a person to a person's work.",
              example: "Wrong: Unlike Darwin, Wallace's paper was brief. → Right: Unlike Darwin's paper, Wallace's was brief.",
            },
          ],
        },
        {
          kind: "callout",
          tone: "tip",
          content:
            "When two answer choices are grammatically identical in effect, neither is the answer — the difference between the choices is always the thing being tested. Find what actually changes between them and you've found the rule in play.",
        },
      ],
    },
  ],
  related: ["critical-reader-books", "critical-reader-blog", "khan-sat-rw", "yt-penguin-test-prep"],
};
