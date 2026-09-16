// Answer grading for both question types. `Question.correctKeys` is the
// single source of truth for both — MCQ holds answerOption ids, SPR holds
// every accepted literal form (e.g. `["14.5", "29/2"]`).

export interface AnswerOption {
  id: string;
  letter: string;
  content: string;
}

/** MCQ: correct iff the selected option's id is one of the accepted keys. */
export function gradeMcq(selectedOptionId: string | null, correctKeys: readonly string[]): boolean | null {
  if (selectedOptionId === null) return null;
  return correctKeys.includes(selectedOptionId);
}

/** Normalize a fill-in response for comparison: trim, drop a leading "+", collapse whitespace. */
export function normalizeSprResponse(raw: string): string {
  return raw.trim().replace(/^\+/, "").replace(/\s+/g, "");
}

/** Parse "3", "-3.5", or "a/b" into a finite number, else null. */
function parseNumeric(value: string): number | null {
  const fraction = /^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(value);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    return numerator / denominator;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const NUMERIC_TOLERANCE = 1e-6;

/**
 * SPR: try an exact normalized-string match against every accepted key
 * first (this is what `correctKeys` is for — it already enumerates
 * equivalent forms like "14.5" and "29/2"). Only if none match exactly,
 * fall back to numeric equivalence, since College Board's accepted-forms
 * list won't always include every valid truncation or equivalent fraction
 * a student might type.
 */
export function gradeSpr(rawResponse: string, correctKeys: readonly string[]): boolean | null {
  if (correctKeys.length === 0) return null; // ungradable — no published answer
  const response = normalizeSprResponse(rawResponse);
  if (response === "") return false;

  const normalizedKeys = correctKeys.map(normalizeSprResponse);
  if (normalizedKeys.includes(response)) return true;

  const responseValue = parseNumeric(response);
  if (responseValue === null) return false;
  return normalizedKeys.some((key) => {
    const keyValue = parseNumeric(key);
    return keyValue !== null && Math.abs(keyValue - responseValue) < NUMERIC_TOLERANCE;
  });
}

export interface GradeResult {
  isCorrect: boolean | null;
  gradable: boolean;
}

export function gradeAnswer(input: {
  type: "mcq" | "spr";
  correctKeys: readonly string[];
  selectedOptionId?: string | null;
  spResponse?: string | null;
}): GradeResult {
  const gradable = input.correctKeys.length > 0;
  if (!gradable) return { isCorrect: null, gradable };

  if (input.type === "mcq") {
    return { isCorrect: gradeMcq(input.selectedOptionId ?? null, input.correctKeys), gradable };
  }
  const response = input.spResponse ?? "";
  if (response.trim() === "") return { isCorrect: null, gradable };
  return { isCorrect: gradeSpr(response, input.correctKeys), gradable };
}
