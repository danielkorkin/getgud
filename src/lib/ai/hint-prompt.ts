import "server-only";

import { toPlainText } from "@/lib/content/plain-text";
import type { AnswerOption } from "@/lib/grading";

const LEVEL_INSTRUCTIONS: Record<number, string> = {
  1: "Give a level-1 NUDGE: point at the relevant concept or first step, in one or two sentences. Do not do any of the algebra/reasoning for them.",
  2: "Give a level-2 APPROACH hint: sketch the method or setup needed (e.g. which formula, what to isolate, what the two texts have in common) in 2-4 sentences, but do not carry out the final calculation or state the answer.",
  3: "Give a level-3 NEAR-SOLUTION hint: walk through the reasoning almost to the end, stopping just short of stating the final answer or the letter/value to select.",
};

export interface HintPromptInput {
  type: "mcq" | "spr";
  stimulus: string | null;
  stem: string;
  options: AnswerOption[] | null;
  rationale: string | null;
  level: 1 | 2 | 3;
}

export function buildHintPrompt(input: HintPromptInput): { system: string; prompt: string } {
  const stimulusText = input.stimulus ? toPlainText(input.stimulus) : null;
  const stemText = toPlainText(input.stem);
  const optionsText =
    input.options?.map((o) => `${o.letter}. ${toPlainText(o.content)}`).join("\n") ?? null;
  const rationaleText = input.rationale ? toPlainText(input.rationale) : null;

  const system = [
    "You are a patient SAT/PSAT tutor giving a short hint on a practice question.",
    "You are given the official answer explanation for context ONLY — never quote, paraphrase closely, or reveal it, and never state or imply the final answer or which choice is correct.",
    "Guide the student's thinking; do not solve the problem for them.",
    "Keep the entire response under 80 words, plain text, no markdown headers.",
  ].join(" ");

  const prompt = [
    stimulusText ? `Passage:\n${stimulusText}\n` : "",
    `Question:\n${stemText}`,
    optionsText ? `\nChoices:\n${optionsText}` : "",
    rationaleText ? `\n(Internal reference only — do not reveal) Official explanation:\n${rationaleText}` : "",
    `\n${LEVEL_INSTRUCTIONS[input.level]}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { system, prompt };
}
