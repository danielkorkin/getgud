// Server-only. Builds the prompt for "Smart select" (src/lib/query/smart-select.ts) —
// mirrors coach-prompt.ts/stats-prompt.ts's shape: pure, no I/O, typed input
// in, { system, prompt } out.
//
// This prompt NEVER includes rationale or correctAnswer. Its output is shown
// to the student BEFORE they practice the set (a reason per pick, in the
// preview list) — leaking an answer here would spoil the question, the same
// reasoning that keeps /api/coach closed until an attempt is answered.
import "server-only";

export interface SmartSelectCandidateInput {
  index: number; // 1-based, matches the schema's `picks[].index`
  sectionCode: string;
  domainLabel: string;
  skillLabel: string;
  difficulty: string;
  type: string;
  stimulus: string | null;
  stem: string;
  options: string[] | null;
}

const SYSTEM_RULES = [
  "You are helping a student build an SAT/PSAT practice set by searching a question bank for content matching their own free-text description.",
  "You are given a numbered list of candidate questions (passage/stimulus, stem, and answer choices) that already match the student's chosen filters (assessment, section, difficulty, domain/skill). Your only job is to pick which of THESE candidates genuinely match the student's description — you are not choosing between candidates and anything outside this list.",
  "Match the description literally and specifically, not loosely or thematically. A candidate only counts as a match if it actually exhibits the described feature in its own text — a Reading & Writing passage described as needing 'figurative language' must actually contain a figure of speech (metaphor, simile, personification, etc.) that you can point to; a description like 'semicolons' means the passage/stem must actually contain a semicolon used the way described.",
  "Never pad the results to reach the requested count. Returning 5 genuine matches is strictly better than returning 10 where half are weak or unrelated — a false positive actively wastes the student's practice time.",
  "Rank your picks best-match first.",
  "Each pick's reason must name the concrete feature of THAT question that matched, in 15 words or fewer — e.g. 'Extended metaphor comparing memory to a locked drawer' or 'Two independent clauses joined by a semicolon in the second sentence.' Never write a generic restatement like 'matches the prompt.'",
  "CRITICAL: never reveal, hint at, or reference the correct answer, a specific answer choice's correctness, or any part of the official rationale in a reason — you were not given this information for these candidates, and reasons are shown to the student before they attempt the question.",
  "If nothing in the candidate list is a genuine match, return an empty picks array and use `note` to say so plainly — do not force weak matches just to return something.",
  "Use `note` (an empty string if there's nothing to add) only for something the student needs to know about the search itself — e.g. that matches were sparse, or that the description was ambiguous and you interpreted it a specific way.",
];

function formatCandidate(c: SmartSelectCandidateInput): string {
  const tag = `[${c.sectionCode} · ${c.domainLabel} / ${c.skillLabel} · ${c.difficulty} · ${c.type}]`;
  return [
    `#${c.index} ${tag}`,
    c.stimulus ? `Passage: ${c.stimulus}` : null,
    `Stem: ${c.stem}`,
    c.options ? `Choices:\n${c.options.join("\n")}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function buildRerankPrompt(
  userPrompt: string,
  candidates: SmartSelectCandidateInput[],
  requestedCount: number,
): { system: string; prompt: string } {
  const system = SYSTEM_RULES.join(" ");

  const candidateBlock = candidates.map(formatCandidate).join("\n\n");

  const prompt = [
    `Student's description: "${userPrompt}"`,
    `They asked for up to ${requestedCount} question${requestedCount === 1 ? "" : "s"}.`,
    "",
    `Candidates (numbered #1-#${candidates.length}, already filtered to the student's chosen assessment/section/difficulty/domain):`,
    "",
    candidateBlock,
  ].join("\n");

  return { system, prompt };
}
