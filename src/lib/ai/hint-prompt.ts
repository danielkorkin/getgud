import "server-only";

import { toPlainText } from "@/lib/content/plain-text";
import type { AnswerOption } from "@/lib/grading";

const LEVEL_INSTRUCTIONS: Record<number, string> = {
  1: "level 1 = NUDGE: point at the relevant concept or first step, in one or two sentences. Do not do any of the algebra/reasoning for them.",
  2: "level 2 = APPROACH: sketch the method or setup needed (e.g. which formula, what to isolate, what the two texts have in common) in 2-4 sentences, but do not carry out the final calculation or state the answer.",
  3: "level 3 = NEAR-SOLUTION: walk through the reasoning almost to the end, stopping just short of stating the final answer or the letter/value to select.",
};

export interface HintPromptInput {
  type: "mcq" | "spr";
  stimulus: string | null;
  stem: string;
  options: AnswerOption[] | null;
  rationale: string | null;
  level: 1 | 2 | 3;
  /** Content of this question's already-cached lower-level hint(s), so level 2/3 build on what the student already read instead of repeating it. Ordered low-to-high, excludes the requested level. */
  priorHints?: { level: number; content: string }[];
}

export function buildHintPrompt(input: HintPromptInput): { system: string; prompt: string } {
  const stimulusText = input.stimulus ? toPlainText(input.stimulus) : null;
  const stemText = toPlainText(input.stem);
  const optionsText =
    input.options?.map((o) => `${o.letter}. ${toPlainText(o.content)}`).join("\n") ?? null;
  const rationaleText = input.rationale ? toPlainText(input.rationale) : null;
  const priorHintsText = input.priorHints?.length
    ? input.priorHints.map((h) => `Level ${h.level}: ${h.content}`).join("\n")
    : null;

  const system = [
    "You are a patient SAT/PSAT tutor giving a short hint on a practice question.",
    "You are given the official answer explanation for context ONLY — never quote, paraphrase closely, or reveal it, and never state or imply the final answer or which choice is correct.",
    "Guide the student's thinking; do not solve the problem for them.",
    "This is a 3-level hint ladder the student climbs one step at a time:",
    LEVEL_INSTRUCTIONS[1],
    LEVEL_INSTRUCTIONS[2],
    LEVEL_INSTRUCTIONS[3],
    "You are giving the level named in the request below. If the student already saw earlier levels (given to you for context), build on them — advance the thinking, don't restate what they already read.",
    "Keep the entire response under 80 words, plain text, no markdown headers.",
  ].join(" ");

  const prompt = [
    stimulusText ? `Passage:\n${stimulusText}\n` : "",
    `Question:\n${stemText}`,
    optionsText ? `\nChoices:\n${optionsText}` : "",
    rationaleText ? `\n(Internal reference only — do not reveal) Official explanation:\n${rationaleText}` : "",
    priorHintsText ? `\nHints already shown to the student:\n${priorHintsText}` : "",
    `\nGive level ${input.level} now: ${LEVEL_INSTRUCTIONS[input.level]}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { system, prompt };
}
