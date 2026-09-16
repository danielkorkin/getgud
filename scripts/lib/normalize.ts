// Normalize raw scraped College Board payloads into the Question /
// QuestionAssessment row shapes. Pure functions — no fs, no network, no DB.

import { createHash } from "node:crypto";

import { stripMathImages } from "./html";
import type { AssessmentKey, ListRow } from "./qbank";

export class QuarantineError extends Error {
  constructor(
    public readonly key: string,
    reason: string,
  ) {
    super(`quarantined ${key}: ${reason}`);
    this.name = "QuarantineError";
  }
}

export interface AnswerOption {
  id: string;
  letter: string;
  content: string;
}

export interface NormalizedQuestion {
  id: string;
  externalId: string | null;
  ibn: string | null;
  contentSource: "qbank" | "saic";
  type: "mcq" | "spr";
  stem: string;
  stimulus: string | null;
  rationale: string | null;
  answerOptions: AnswerOption[] | null;
  correctKeys: string[];
  correctAnswer: string[];
  vaultId: string | null;
  origin: string | null;
  templateClusterId: string | null;
  templateClusterName: string | null;
  parentTemplateId: string | null;
  parentTemplateName: string | null;
  positionIndex: number | null;
  raw: unknown;
  contentHash: string;
  hasEmbeddedMathImages: boolean;
  fetchedAt: string;
}

export interface NormalizedPlacement {
  assessment: string;
  questionId: string;
  asmtEventId: number;
  program: string;
  section: number;
  sectionCode: string;
  domainCode: string;
  domainDesc: string;
  skillCode: string;
  skillDesc: string;
  difficulty: string;
  scoreBand: number | null;
  bankQuestionId: string;
  uId: string | null;
  pPcc: string | null;
  createDate: string | null;
  updateDate: string | null;
  listRaw: unknown;
}

/** Deterministic JSON stringify (sorted keys) so contentHash is stable
 * regardless of upstream key ordering. */
function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${canonicalStringify((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function contentHash(raw: unknown): string {
  return createHash("sha256").update(canonicalStringify(raw)).digest("hex");
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// ---- qbank (POST /get-question) ----------------------------------------

interface QbankAnswerOption {
  id: string;
  content: string;
}

interface QbankDetail {
  type?: string;
  stem?: string;
  stimulus?: string;
  keys?: string[];
  answerOptions?: QbankAnswerOption[];
  rationale?: string;
  correct_answer?: string[];
  vaultid?: string;
  origin?: string;
  templateclusterid?: string;
  templateclustername?: string;
  parenttemplateid?: string;
  parenttemplatename?: string;
  position?: number;
}

function isQbankDetail(value: unknown): value is QbankDetail {
  return typeof value === "object" && value !== null && "type" in value && "stem" in value;
}

export function normalizeQbank(raw: unknown, externalId: string): NormalizedQuestion {
  if (!isQbankDetail(raw)) {
    throw new QuarantineError(externalId, "detail payload missing type/stem");
  }
  if (raw.type !== "mcq" && raw.type !== "spr") {
    throw new QuarantineError(externalId, `unrecognized qbank type: ${String(raw.type)}`);
  }

  const stem = stripMathImages(raw.stem ?? "");
  const stimulusText = raw.stimulus ?? null;
  const stimulus = stimulusText !== null ? stripMathImages(stimulusText) : null;
  const rationaleText = raw.rationale ?? null;
  const rationale = rationaleText !== null ? stripMathImages(rationaleText) : null;

  let answerOptions: AnswerOption[] | null = null;
  let unresolvedOptions = 0;
  if (raw.type === "mcq") {
    const opts = raw.answerOptions ?? [];
    answerOptions = opts.map((o, i) => {
      const stripped = stripMathImages(o.content);
      unresolvedOptions += stripped.unresolved;
      return { id: o.id, letter: String.fromCharCode(65 + i), content: stripped.html };
    });
  }

  const hasEmbeddedMathImages =
    (stem.unresolved > 0) ||
    (stimulus?.unresolved ?? 0) > 0 ||
    (rationale?.unresolved ?? 0) > 0 ||
    unresolvedOptions > 0;

  return {
    id: externalId,
    externalId,
    ibn: null,
    contentSource: "qbank",
    type: raw.type,
    stem: stem.html,
    stimulus: stimulus?.html ?? null,
    rationale: rationale?.html ?? null,
    answerOptions,
    correctKeys: raw.keys ?? [],
    correctAnswer: raw.correct_answer ?? [],
    vaultId: str(raw.vaultid),
    origin: str(raw.origin),
    templateClusterId: str(raw.templateclusterid),
    templateClusterName: str(raw.templateclustername),
    parentTemplateId: str(raw.parenttemplateid),
    parentTemplateName: str(raw.parenttemplatename),
    positionIndex: typeof raw.position === "number" ? raw.position : null,
    raw,
    contentHash: contentHash(raw),
    hasEmbeddedMathImages,
    fetchedAt: new Date().toISOString(),
  };
}

// ---- saic / IBN (disclosed/{ibn}.json) ----------------------------------

interface SaicChoice {
  body: string;
}

interface SaicAnswer {
  style?: string;
  choices?: Record<string, SaicChoice>;
  correct_choice?: string;
  rationale?: string;
}

interface SaicItem {
  item_id?: string;
  prompt?: string;
  body?: string;
  answer?: SaicAnswer;
}

function isSaicItem(value: unknown): value is SaicItem {
  // Most items carry the stem in `prompt` with an optional `body` as a
  // secondary stimulus (e.g. a shared table). A minority carry the whole
  // stem in `body` alone with no `prompt` key at all (verified: 029650-DC).
  // Require `answer` plus at least one of the two stem-bearing fields.
  return (
    typeof value === "object" &&
    value !== null &&
    "answer" in value &&
    ("prompt" in value || "body" in value)
  );
}

export function normalizeIbn(raw: unknown, ibn: string, latexLookup?: Map<string, string>): NormalizedQuestion {
  if (!Array.isArray(raw)) {
    throw new QuarantineError(ibn, "saic response is not an array");
  }
  const items = raw.filter(isSaicItem);
  let el = items.find((it) => it.item_id === ibn);
  if (!el && items.length === 1) el = items[0];
  if (!el) {
    throw new QuarantineError(ibn, `no element with item_id === ${ibn} and array length != 1`);
  }
  const answer = el.answer ?? {};
  const style = answer.style;

  // When `prompt` is absent, `body` carries the whole stem (verified:
  // 029650-DC) rather than being a secondary stimulus alongside a prompt.
  const stemSource = el.prompt ?? el.body ?? "";
  const stimulusSource = el.prompt ? el.body : undefined;
  const promptStripped = stripMathImages(stemSource, latexLookup);
  const bodyStripped = stimulusSource ? stripMathImages(stimulusSource, latexLookup) : null;
  const rationaleStripped = answer.rationale ? stripMathImages(answer.rationale, latexLookup) : null;

  let type: "mcq" | "spr";
  let answerOptions: AnswerOption[] | null = null;
  let correctKeys: string[] = [];
  let correctAnswer: string[] = [];
  let unresolvedOptions = 0;

  if (style === "Multiple Choice") {
    type = "mcq";
    const choices = answer.choices ?? {};
    const letters = Object.keys(choices).sort();
    answerOptions = letters.map((letter) => {
      const stripped = stripMathImages(choices[letter].body, latexLookup);
      unresolvedOptions += stripped.unresolved;
      return { id: letter, letter: letter.toUpperCase(), content: stripped.html };
    });
    if (answer.correct_choice) {
      correctKeys = [answer.correct_choice];
      correctAnswer = [answer.correct_choice.toUpperCase()];
    }
    // else: a minority of disclosed MCQ items carry `choices` and `rationale`
    // but no `correct_choice` field at all — a CB data gap, not a parse
    // failure. Left empty and counted by the loader rather than guessed.
  } else if (style === "SPR") {
    type = "spr";
    // College Board's disclosed SPR payload is `{style: "SPR", rationale}` —
    // no correct-answer field exists at all. Recovering it would mean
    // regex-scraping prose out of the rationale HTML, which is unreliable
    // (verified: ~9% of these render their answer as a math image with no
    // text form whatsoever) and risks silently storing a WRONG answer for a
    // study tool. Left empty (correctAnswer.length === 0) rather than
    // guessed; the loader reports the count of these explicitly.
  } else {
    throw new QuarantineError(ibn, `unrecognized saic answer.style: ${String(style)}`);
  }

  const hasEmbeddedMathImages =
    promptStripped.unresolved > 0 ||
    (bodyStripped?.unresolved ?? 0) > 0 ||
    (rationaleStripped?.unresolved ?? 0) > 0 ||
    unresolvedOptions > 0;

  return {
    id: ibn,
    externalId: null,
    ibn,
    contentSource: "saic",
    type,
    stem: promptStripped.html,
    stimulus: bodyStripped?.html ?? null,
    rationale: rationaleStripped?.html ?? null,
    answerOptions,
    correctKeys,
    correctAnswer,
    vaultId: null,
    origin: null,
    templateClusterId: null,
    templateClusterName: null,
    parentTemplateId: null,
    parentTemplateName: null,
    positionIndex: null,
    raw: el,
    contentHash: contentHash(el),
    hasEmbeddedMathImages,
    fetchedAt: new Date().toISOString(),
  };
}

// ---- placements (list rows) ---------------------------------------------

export interface ListEntry {
  row: ListRow;
  assessmentKey: AssessmentKey;
  assessmentLabel: string;
  asmtEventId: number;
  program: string;
  section: number;
  sectionCode: string;
}

/** Pick the most frequent skill_desc spelling per skill_cd across the whole
 * corpus (upstream casing is inconsistent, e.g. "Cross-Text Connections" vs
 * "Cross-text Connections" both appear for CTC). Ties break alphabetically
 * for determinism. */
export function buildSkillDescMap(entries: ListEntry[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const { row } of entries) {
    const byDesc = counts.get(row.skill_cd) ?? new Map<string, number>();
    byDesc.set(row.skill_desc, (byDesc.get(row.skill_desc) ?? 0) + 1);
    counts.set(row.skill_cd, byDesc);
  }
  const result = new Map<string, string>();
  for (const [code, byDesc] of counts) {
    const sorted = [...byDesc.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    result.set(code, sorted[0][0]);
  }
  return result;
}

export function questionKeyOf(row: ListRow): string {
  const hasExternal = !!row.external_id;
  const hasIbn = !!row.ibn;
  if (hasExternal === hasIbn) {
    throw new Error(`row violates external_id XOR ibn invariant: ${JSON.stringify(row)}`);
  }
  return (row.external_id ?? row.ibn) as string;
}

export function normalizePlacement(
  entry: ListEntry,
  skillDescMap: Map<string, string>,
): NormalizedPlacement {
  const { row } = entry;
  return {
    assessment: entry.assessmentLabel,
    questionId: questionKeyOf(row),
    asmtEventId: entry.asmtEventId,
    program: entry.program,
    section: entry.section,
    sectionCode: entry.sectionCode,
    domainCode: row.primary_class_cd,
    domainDesc: row.primary_class_cd_desc,
    skillCode: row.skill_cd,
    skillDesc: skillDescMap.get(row.skill_cd) ?? row.skill_desc,
    difficulty: row.difficulty,
    scoreBand: typeof row.score_band_range_cd === "number" ? row.score_band_range_cd : null,
    bankQuestionId: row.questionId,
    uId: row.uId ?? null,
    pPcc: row.pPcc ?? null,
    createDate: typeof row.createDate === "number" ? new Date(row.createDate).toISOString() : null,
    updateDate: typeof row.updateDate === "number" ? new Date(row.updateDate).toISOString() : null,
    listRaw: row,
  };
}
