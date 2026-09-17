// Server-only. Builds the system prompt + message context for the post-answer
// coach (/api/coach) — a "summary" (one-sentence takeaway on a wrong answer)
// or a "chat" (free-form follow-up), both with full context about the
// question. Unlike hint-prompt.ts, the coach only ever runs after the
// question is answered, so it is allowed to state and explain the correct
// answer — see the caller's `status === "answered"` gate in the route.
import "server-only";

import { toPlainText } from "@/lib/content/plain-text";
import type { AnswerOption } from "@/lib/grading";

export interface CoachContextInput {
  type: "mcq" | "spr";
  stimulus: string | null;
  stem: string;
  options: AnswerOption[] | null;
  rationale: string | null;
  correctLetter: string | null;
  correctAnswer: readonly string[];
  selectedLetter: string | null;
  spResponse: string | null;
  isCorrect: boolean | null;
  answerRevealed: boolean;
  /** Hints the student already unlocked for this question, low-to-high. */
  usedHints: { level: number; content: string }[];
}

export interface CoachMessage {
  role: "user" | "assistant";
  content: string;
}

const BASE_RULES = [
  "You are a patient, encouraging SAT/PSAT tutor helping a student review a practice question they have already submitted an answer to.",
  "Unlike a pre-answer hint, you MAY state and explain the correct answer here — the official rationale is already visible to the student on screen.",
  "Keep responses plain text: no markdown headers, no bullet lists, no LaTeX — write math inline in simple notation like x^2 or sqrt(2).",
  "Be concise. Do not repeat the full question or choices back verbatim; the student can already see them.",
];

function buildContext(input: CoachContextInput): string {
  const stimulusText = input.stimulus ? toPlainText(input.stimulus) : null;
  const stemText = toPlainText(input.stem);
  const optionsText =
    input.options?.map((o) => `${o.letter}. ${toPlainText(o.content)}`).join("\n") ?? null;
  const rationaleText = input.rationale ? toPlainText(input.rationale) : null;
  const hintsText = input.usedHints.length
    ? input.usedHints.map((h) => `Level ${h.level}: ${h.content}`).join("\n")
    : null;

  const studentAnswer = input.answerRevealed
    ? "The student gave up and revealed the answer without submitting one."
    : input.type === "mcq"
      ? `The student chose: ${input.selectedLetter ?? "(no answer)"}`
      : `The student answered: ${input.spResponse ?? "(no answer)"}`;

  const outcome =
    input.isCorrect === true
      ? "This was CORRECT."
      : input.isCorrect === false
        ? "This was INCORRECT."
        : "This question isn't auto-gradable.";

  return [
    stimulusText ? `Passage:\n${stimulusText}\n` : "",
    `Question:\n${stemText}`,
    optionsText ? `\nChoices:\n${optionsText}` : "",
    `\nCorrect answer: ${input.correctLetter ?? (input.correctAnswer.length > 0 ? input.correctAnswer.join(" or ") : "(unpublished)")}`,
    rationaleText ? `\nOfficial explanation:\n${rationaleText}` : "",
    `\n${studentAnswer} ${outcome}`,
    hintsText ? `\nHints the student already saw before answering:\n${hintsText}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** One-sentence takeaway shown in the bubble after a wrong submission. Only ever called for isCorrect === false. */
export function buildSummaryPrompt(input: CoachContextInput): { system: string; prompt: string } {
  const system = [
    ...BASE_RULES,
    "Write exactly ONE sentence, at most 30 words: name what the student's specific choice got wrong or missed, and the key idea that leads to the right answer. Warm, direct, no filler like \"Great try\".",
  ].join(" ");

  return { system, prompt: buildContext(input) };
}

/** Full chat: system prompt carrying the question context, plus the running message history (reset per-question by the client). */
export function buildChatPrompt(
  input: CoachContextInput,
  messages: CoachMessage[],
): { system: string; messages: CoachMessage[] } {
  const system = [
    ...BASE_RULES,
    "Answer the student's question about this specific SAT/PSAT question. Aim for under 120 words per reply unless they ask for more detail.",
    "\n--- Question context ---",
    buildContext(input),
  ].join(" ");

  return { system, messages };
}
