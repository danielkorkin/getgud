// Pure aggregation over a profile's full attempt history — no I/O. Every
// input row here is the column projection `src/app/stats/page.tsx` (and
// `src/actions/stats.ts`, which needs the same bundle to build the AI
// prompt) fetches from `Attempt`/`PracticeSet`/`ExamSession`. Kept
// dependency-free from `@/prisma/db` so it stays trivially testable and
// reusable from both the page and the server action.
//
// `Attempt` carries no `mode` column (practice vs exam) — mode is looked up
// through `setId -> PracticeSet.mode`, built once in `buildStatsBundle`.

import { domainLabel, skillLabel } from "@/lib/catalog";

export interface AttemptStatsRow {
  id: string;
  setId: string;
  assessment: string;
  sectionCode: string;
  domainCode: string;
  skillCode: string;
  difficulty: string;
  scoreBand: number | null;
  type: string;
  status: string;
  isCorrect: boolean | null;
  gradable: boolean;
  submittedAt: string | null;
  activeMs: number;
  totalMs: number;
  timeToFirstInputMs: number | null;
  timeAfterFeedbackMs: number;
  answerChangeCount: number;
  markedForReview: boolean;
  eliminationCount: number;
  hintsUsed: number;
  maxHintLevel: number;
  answerRevealed: boolean;
  calculatorOpened: boolean;
  referenceOpened: boolean;
  highlightCount: number;
}

export interface SetStatsRow {
  id: string;
  mode: string;
  status: string;
  name: string;
  assessment: string;
  questionCount: number;
  correctCount: number;
  gradedCount: number;
  totalActiveMs: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ExamSessionStatsRow {
  id: string;
  setId: string;
  examId: string;
  phase: string;
  rwScaled: number | null;
  mathScaled: number | null;
  totalScaled: number | null;
  completedAt: string | null;
}

/** The one accuracy predicate used everywhere. Excludes unanswered/skipped,
 *  ungradable questions, and in-flight exam attempts (isCorrect stays NULL
 *  until the module is submitted) — see the contract's Attempt.status
 *  comment. An `answerRevealed` attempt still passes this (isCorrect is
 *  already false), so it counts as wrong, never as ungraded. */
function isGraded(a: AttemptStatsRow): boolean {
  return a.status === "answered" && a.gradable && a.isCorrect !== null;
}

function pct(correct: number, graded: number): number {
  return graded > 0 ? correct / graded : 0;
}

function dateKey(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD, UTC — good enough for a day bucket
}

function isoWeekStart(iso: string): string {
  const d = new Date(dateKey(iso) + "T00:00:00Z");
  const day = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface AccuracyPoint {
  bucketStart: string;
  correct: number;
  graded: number;
}

export function accuracyOverTime(attempts: AttemptStatsRow[]): AccuracyPoint[] {
  const graded = attempts.filter(isGraded).filter((a) => a.submittedAt);
  if (graded.length === 0) return [];

  const dates = graded.map((a) => new Date(a.submittedAt!).getTime());
  const rangeDays = (Math.max(...dates) - Math.min(...dates)) / 86_400_000;
  const useWeeks = rangeDays > 45;
  const bucketFn = useWeeks ? isoWeekStart : dateKey;

  const buckets = new Map<string, { correct: number; graded: number }>();
  for (const a of graded) {
    const key = bucketFn(a.submittedAt!);
    const entry = buckets.get(key) ?? { correct: 0, graded: 0 };
    entry.graded += 1;
    if (a.isCorrect) entry.correct += 1;
    buckets.set(key, entry);
  }

  return [...buckets.entries()]
    .map(([bucketStart, v]) => ({ bucketStart, ...v }))
    .sort((a, b) => a.bucketStart.localeCompare(b.bucketStart));
}

export interface SkillRow {
  skillCode: string;
  skillLabel: string;
  domainCode: string;
  domainLabel: string;
  sectionCode: string;
  correct: number;
  graded: number;
  rate: number;
  avgActiveMs: number;
}

export function bySkill(attempts: AttemptStatsRow[]): SkillRow[] {
  const graded = attempts.filter(isGraded);
  const map = new Map<string, { domainCode: string; sectionCode: string; correct: number; graded: number; activeMs: number[] }>();
  for (const a of graded) {
    const entry = map.get(a.skillCode) ?? { domainCode: a.domainCode, sectionCode: a.sectionCode, correct: 0, graded: 0, activeMs: [] };
    entry.graded += 1;
    if (a.isCorrect) entry.correct += 1;
    entry.activeMs.push(a.activeMs);
    map.set(a.skillCode, entry);
  }
  return [...map.entries()]
    .map(([skillCode, v]) => ({
      skillCode,
      skillLabel: skillLabel(skillCode),
      domainCode: v.domainCode,
      domainLabel: domainLabel(v.domainCode),
      sectionCode: v.sectionCode,
      correct: v.correct,
      graded: v.graded,
      rate: pct(v.correct, v.graded),
      avgActiveMs: v.activeMs.reduce((s, n) => s + n, 0) / v.activeMs.length,
    }))
    .sort((a, b) => a.rate - b.rate || b.graded - a.graded);
}

export interface DomainRow {
  domainCode: string;
  domainLabel: string;
  sectionCode: string;
  correct: number;
  graded: number;
  rate: number;
}

export function byDomain(skills: SkillRow[]): DomainRow[] {
  const map = new Map<string, { sectionCode: string; correct: number; graded: number }>();
  for (const s of skills) {
    const entry = map.get(s.domainCode) ?? { sectionCode: s.sectionCode, correct: 0, graded: 0 };
    entry.correct += s.correct;
    entry.graded += s.graded;
    map.set(s.domainCode, entry);
  }
  return [...map.entries()]
    .map(([domainCode, v]) => ({ domainCode, domainLabel: domainLabel(domainCode), ...v, rate: pct(v.correct, v.graded) }))
    .sort((a, b) => a.rate - b.rate);
}

export interface DifficultyRow {
  difficulty: "E" | "M" | "H";
  correct: number;
  graded: number;
  rate: number;
}

export function byDifficulty(attempts: AttemptStatsRow[]): DifficultyRow[] {
  const order: ("E" | "M" | "H")[] = ["E", "M", "H"];
  const graded = attempts.filter(isGraded);
  return order.map((difficulty) => {
    const rows = graded.filter((a) => a.difficulty === difficulty);
    const correct = rows.filter((a) => a.isCorrect).length;
    return { difficulty, correct, graded: rows.length, rate: pct(correct, rows.length) };
  });
}

export interface QuestionTypeRow {
  type: "mcq" | "spr";
  correct: number;
  graded: number;
  rate: number;
}

export function byQuestionType(attempts: AttemptStatsRow[]): QuestionTypeRow[] {
  const order: ("mcq" | "spr")[] = ["mcq", "spr"];
  const graded = attempts.filter(isGraded);
  return order.map((type) => {
    const rows = graded.filter((a) => a.type === type);
    const correct = rows.filter((a) => a.isCorrect).length;
    return { type, correct, graded: rows.length, rate: pct(correct, rows.length) };
  });
}

export interface TimeQuartile {
  quartile: 1 | 2 | 3 | 4;
  correct: number;
  graded: number;
  rate: number;
  medianMs: number;
}

/** Buckets graded attempts into quartiles of `activeMs` rather than a raw
 *  scatter — hundreds of points against a binary correct/incorrect axis is
 *  unreadable; quartile bars tell the same "does slower help or hurt" story
 *  legibly. See the dataviz skill's anti-pattern guidance. */
export function timeVsCorrectness(attempts: AttemptStatsRow[]): TimeQuartile[] {
  const graded = attempts.filter(isGraded).sort((a, b) => a.activeMs - b.activeMs);
  if (graded.length < 4) return [];

  const quartileSize = Math.ceil(graded.length / 4);
  const result: TimeQuartile[] = [];
  for (let q = 0; q < 4; q++) {
    const slice = graded.slice(q * quartileSize, (q + 1) * quartileSize);
    if (slice.length === 0) continue;
    const correct = slice.filter((a) => a.isCorrect).length;
    result.push({
      quartile: (q + 1) as 1 | 2 | 3 | 4,
      correct,
      graded: slice.length,
      rate: pct(correct, slice.length),
      medianMs: median(slice.map((a) => a.activeMs)),
    });
  }
  return result;
}

export interface HintImpactRow {
  hints: "0" | "1" | "2+";
  correct: number;
  graded: number;
  rate: number;
}

export function hintImpact(attempts: AttemptStatsRow[]): HintImpactRow[] {
  const graded = attempts.filter(isGraded);
  const buckets: HintImpactRow["hints"][] = ["0", "1", "2+"];
  return buckets.map((hints) => {
    const rows = graded.filter((a) => (hints === "0" ? a.hintsUsed === 0 : hints === "1" ? a.hintsUsed === 1 : a.hintsUsed >= 2));
    const correct = rows.filter((a) => a.isCorrect).length;
    return { hints, correct, graded: rows.length, rate: pct(correct, rows.length) };
  });
}

export interface RevealStats {
  revealedCount: number;
  gradedCount: number;
}

export function revealRate(attempts: AttemptStatsRow[]): RevealStats {
  const graded = attempts.filter(isGraded);
  return { revealedCount: graded.filter((a) => a.answerRevealed).length, gradedCount: graded.length };
}

export interface SecondGuessBucket {
  changed: boolean;
  correct: number;
  graded: number;
  rate: number;
}

export function secondGuessing(attempts: AttemptStatsRow[]): SecondGuessBucket[] {
  const graded = attempts.filter(isGraded);
  return [false, true].map((changed) => {
    const rows = graded.filter((a) => (a.answerChangeCount > 0) === changed);
    const correct = rows.filter((a) => a.isCorrect).length;
    return { changed, correct, graded: rows.length, rate: pct(correct, rows.length) };
  });
}

export interface MarkForReviewRow {
  marked: boolean;
  correct: number;
  graded: number;
  rate: number;
}

export function markForReviewImpact(attempts: AttemptStatsRow[]): MarkForReviewRow[] {
  const graded = attempts.filter(isGraded);
  return [false, true].map((marked) => {
    const rows = graded.filter((a) => a.markedForReview === marked);
    const correct = rows.filter((a) => a.isCorrect).length;
    return { marked, correct, graded: rows.length, rate: pct(correct, rows.length) };
  });
}

const PACING_MIN_BASELINE_SAMPLES = 5;
const SLOW_CORRECT_RATIO = 1.6;
// A 10s baseline makes a 16s answer technically "1.6x," which isn't what
// anyone means by "took a long time" — this absolute floor keeps the signal
// meaningful regardless of how fast a bucket's baseline happens to be.
const SLOW_CORRECT_FLOOR_MS = 60_000;
const RUSHED_WRONG_RATIO = 0.5;
// A tab left open (or backgrounded overnight) can put `totalMs` in the tens
// of minutes without the student having actually sat there stuck — past
// this ceiling there's no way to tell "genuinely slow" from "walked away,"
// so these attempts are dropped from the baseline *and* from ever
// qualifying as slow, rather than dominating the flagged list.
const PACING_CEILING_MS = 10 * 60_000;

interface PacingBaseline {
  byBucket: Map<string, number>; // `${sectionCode}:${difficulty}` -> median ms
  bySection: Map<string, number>; // sectionCode -> median ms
  overallMs: number;
}

function pacingBucketKey(sectionCode: string, difficulty: string): string {
  return `${sectionCode}:${difficulty}`;
}

/** The population pacing is judged over: graded, correct, not revealed, no
 *  hint used, and under the tab-left-open ceiling. `totalMs` (not
 *  `activeMs`) is the right field here — per live-timer.tsx / CLAUDE.md it's
 *  the value that freezes the instant a question is answered, so unlike
 *  `activeMs` (which keeps accumulating through the post-answer rationale
 *  and coach chat, a core feature of this app) it never gets inflated by
 *  what the student does *after* getting the question right. A hint pads
 *  the time it took in a way that has nothing to do with the student's own
 *  pace, so hinted answers are excluded from both the baseline and the
 *  signal itself — `hintImpact`/the hint-impact insight already covers
 *  hint usage on its own terms. */
function pacingEligible(a: AttemptStatsRow): boolean {
  return isGraded(a) && !a.answerRevealed && a.hintsUsed === 0 && a.totalMs > 0 && a.totalMs <= PACING_CEILING_MS;
}

/** "Slow" only means something relative to how a given student paces
 *  normally, so the baseline is always the student's own median time on
 *  their *other* eligible correct answers — never a fixed number of
 *  seconds. Bucketed by section+difficulty (RW and Math, and easy vs hard
 *  questions, have very different normal paces); falls back to a
 *  section-wide median, then an overall median, whenever a bucket is too
 *  thin (<5 samples) to trust — and the overall fallback itself is only
 *  trusted past that same sample floor, rather than ever letting a
 *  near-empty history produce a baseline from a couple of data points. */
function computePacingBaseline(attempts: AttemptStatsRow[]): PacingBaseline {
  const correct = attempts.filter(pacingEligible).filter((a) => a.isCorrect);
  const bucketSamples = new Map<string, number[]>();
  const sectionSamples = new Map<string, number[]>();
  const all: number[] = [];
  for (const a of correct) {
    all.push(a.totalMs);
    const bucketKey = pacingBucketKey(a.sectionCode, a.difficulty);
    (bucketSamples.get(bucketKey) ?? bucketSamples.set(bucketKey, []).get(bucketKey)!).push(a.totalMs);
    (sectionSamples.get(a.sectionCode) ?? sectionSamples.set(a.sectionCode, []).get(a.sectionCode)!).push(a.totalMs);
  }
  const byBucket = new Map<string, number>();
  for (const [key, samples] of bucketSamples) if (samples.length >= PACING_MIN_BASELINE_SAMPLES) byBucket.set(key, median(samples));
  const bySection = new Map<string, number>();
  for (const [key, samples] of sectionSamples) if (samples.length >= PACING_MIN_BASELINE_SAMPLES) bySection.set(key, median(samples));
  return { byBucket, bySection, overallMs: all.length >= PACING_MIN_BASELINE_SAMPLES ? median(all) : 0 };
}

function pacingBaselineFor(baseline: PacingBaseline, a: AttemptStatsRow): number {
  return baseline.byBucket.get(pacingBucketKey(a.sectionCode, a.difficulty)) ?? baseline.bySection.get(a.sectionCode) ?? baseline.overallMs;
}

export interface SlowCorrectQuestion {
  attemptId: string;
  setId: string;
  setName: string;
  mode: "practice" | "exam";
  skillCode: string;
  skillLabel: string;
  domainCode: string;
  domainLabel: string;
  sectionCode: string;
  difficulty: string;
  totalMs: number;
  baselineMs: number;
  ratio: number;
  submittedAt: string;
}

/** Correct answers that took notably longer than this student's own normal
 *  pace — the "you got it right, but it cost you time" signal a plain
 *  accuracy view misses. Deliberately computed across *both* practice sets
 *  and practice tests (unlike the rest of `PracticeStats`, which is
 *  practice-only) — a question worth reviewing because of how long it took
 *  is worth reviewing regardless of which mode surfaced it; see
 *  `PacingStats`'s comment for why this doesn't run into the
 *  practice-vs-exam blending problem the rest of the file avoids. A
 *  question qualifies only past both a relative floor (>=1.6x its baseline)
 *  and an absolute one (>=60s); see `pacingEligible` for what's excluded
 *  (reveals, hinted answers, and implausibly long tab-left-open attempts)
 *  and why. Capped and sorted by how far over pace each one ran, worst
 *  first. */
export function slowCorrectQuestions(
  attempts: AttemptStatsRow[],
  setNameById: Map<string, string>,
  modeBySetId: Map<string, string>,
): SlowCorrectQuestion[] {
  const baseline = computePacingBaseline(attempts);
  return attempts
    .filter((a) => pacingEligible(a) && a.isCorrect && a.submittedAt)
    .map((a) => ({ a, baselineMs: pacingBaselineFor(baseline, a) }))
    .filter(({ a, baselineMs }) => baselineMs > 0 && a.totalMs >= SLOW_CORRECT_FLOOR_MS && a.totalMs / baselineMs >= SLOW_CORRECT_RATIO)
    .map(({ a, baselineMs }) => ({
      attemptId: a.id,
      setId: a.setId,
      setName: setNameById.get(a.setId) ?? "Practice set",
      mode: modeBySetId.get(a.setId) === "exam" ? ("exam" as const) : ("practice" as const),
      skillCode: a.skillCode,
      skillLabel: skillLabel(a.skillCode),
      domainCode: a.domainCode,
      domainLabel: domainLabel(a.domainCode),
      sectionCode: a.sectionCode,
      difficulty: a.difficulty,
      totalMs: a.totalMs,
      baselineMs,
      ratio: a.totalMs / baselineMs,
      submittedAt: a.submittedAt!,
    }))
    .sort((x, y) => y.ratio - x.ratio)
    .slice(0, 25);
}

export interface PacingSkillRow {
  skillCode: string;
  skillLabel: string;
  domainCode: string;
  domainLabel: string;
  sectionCode: string;
  correctGraded: number;
  slowCorrectCount: number;
  slowCorrectRate: number;
  triedWrong: number;
  rushedWrongCount: number;
  rushedWrongRate: number;
}

/** Per-skill rollup of the same pacing signal, plus its mirror image:
 *  "rushed wrong" answers that came in well *under* baseline on a question
 *  the student actually attempted unaided (see `pacingEligible` — same
 *  exclusions apply to the wrong side too, so a hinted-and-still-wrong
 *  answer never counts as "rushed"). Two different failure modes with the
 *  same cause worth catching together: not respecting how long a question
 *  actually needs. */
export function pacingBySkill(attempts: AttemptStatsRow[]): PacingSkillRow[] {
  const baseline = computePacingBaseline(attempts);
  const map = new Map<
    string,
    { domainCode: string; sectionCode: string; correctGraded: number; slowCorrectCount: number; triedWrong: number; rushedWrongCount: number }
  >();
  for (const a of attempts.filter(pacingEligible)) {
    const entry = map.get(a.skillCode) ?? {
      domainCode: a.domainCode,
      sectionCode: a.sectionCode,
      correctGraded: 0,
      slowCorrectCount: 0,
      triedWrong: 0,
      rushedWrongCount: 0,
    };
    const baselineMs = pacingBaselineFor(baseline, a);
    if (a.isCorrect) {
      entry.correctGraded += 1;
      if (baselineMs > 0 && a.totalMs >= SLOW_CORRECT_FLOOR_MS && a.totalMs / baselineMs >= SLOW_CORRECT_RATIO) entry.slowCorrectCount += 1;
    } else {
      entry.triedWrong += 1;
      if (baselineMs > 0 && a.totalMs / baselineMs <= RUSHED_WRONG_RATIO) entry.rushedWrongCount += 1;
    }
    map.set(a.skillCode, entry);
  }
  return [...map.entries()].map(([skillCode, v]) => ({
    skillCode,
    skillLabel: skillLabel(skillCode),
    domainCode: v.domainCode,
    domainLabel: domainLabel(v.domainCode),
    sectionCode: v.sectionCode,
    correctGraded: v.correctGraded,
    slowCorrectCount: v.slowCorrectCount,
    slowCorrectRate: pct(v.slowCorrectCount, v.correctGraded),
    triedWrong: v.triedWrong,
    rushedWrongCount: v.rushedWrongCount,
    rushedWrongRate: pct(v.rushedWrongCount, v.triedWrong),
  }));
}

export interface PacingDomainRow {
  domainCode: string;
  domainLabel: string;
  sectionCode: string;
  correctGraded: number;
  slowCorrectCount: number;
  slowCorrectRate: number;
}

export function pacingByDomain(skills: PacingSkillRow[]): PacingDomainRow[] {
  const map = new Map<string, { sectionCode: string; correctGraded: number; slowCorrectCount: number }>();
  for (const s of skills) {
    const entry = map.get(s.domainCode) ?? { sectionCode: s.sectionCode, correctGraded: 0, slowCorrectCount: 0 };
    entry.correctGraded += s.correctGraded;
    entry.slowCorrectCount += s.slowCorrectCount;
    map.set(s.domainCode, entry);
  }
  return [...map.entries()]
    .map(([domainCode, v]) => ({ domainCode, domainLabel: domainLabel(domainCode), ...v, slowCorrectRate: pct(v.slowCorrectCount, v.correctGraded) }))
    .sort((a, b) => b.slowCorrectRate - a.slowCorrectRate);
}

export interface ToolUsageRow {
  used: boolean;
  correct: number;
  graded: number;
  rate: number;
}

/** Calculator and reference-sheet usage — both are Bluebook Math-section
 *  tools (see src/resources/guides/math-reference.ts), so this is scoped to
 *  `sectionCode === "MATH"`; including R&W attempts (which never set these
 *  flags) would just dilute the "not used" bucket with irrelevant rows. */
function toolUsage(attempts: AttemptStatsRow[], flag: (a: AttemptStatsRow) => boolean): ToolUsageRow[] {
  const mathGraded = attempts.filter(isGraded).filter((a) => a.sectionCode === "MATH");
  return [false, true].map((used) => {
    const rows = mathGraded.filter((a) => flag(a) === used);
    const correct = rows.filter((a) => a.isCorrect).length;
    return { used, correct, graded: rows.length, rate: pct(correct, rows.length) };
  });
}

export function calculatorUsage(attempts: AttemptStatsRow[]): ToolUsageRow[] {
  return toolUsage(attempts, (a) => a.calculatorOpened);
}

export function referenceSheetUsage(attempts: AttemptStatsRow[]): ToolUsageRow[] {
  return toolUsage(attempts, (a) => a.referenceOpened);
}

export interface TimeOfDayRow {
  bucket: "Night" | "Morning" | "Afternoon" | "Evening";
  correct: number;
  graded: number;
  rate: number;
}

const TIME_OF_DAY_BUCKETS: { bucket: TimeOfDayRow["bucket"]; startHour: number; endHour: number }[] = [
  { bucket: "Night", startHour: 0, endHour: 6 },
  { bucket: "Morning", startHour: 6, endHour: 12 },
  { bucket: "Afternoon", startHour: 12, endHour: 18 },
  { bucket: "Evening", startHour: 18, endHour: 24 },
];

/** Buckets by UTC hour-of-day — `submittedAt` carries no client timezone,
 *  so this reflects the server's clock, not necessarily the student's local
 *  time of day. Good enough for a single self-hosted instance running in
 *  one timezone; would need a stored client offset to be exact otherwise. */
export function byTimeOfDay(attempts: AttemptStatsRow[]): TimeOfDayRow[] {
  const graded = attempts.filter(isGraded).filter((a) => a.submittedAt);
  return TIME_OF_DAY_BUCKETS.map(({ bucket, startHour, endHour }) => {
    const rows = graded.filter((a) => {
      const hour = new Date(a.submittedAt!).getUTCHours();
      return hour >= startHour && hour < endHour;
    });
    const correct = rows.filter((a) => a.isCorrect).length;
    return { bucket, correct, graded: rows.length, rate: pct(correct, rows.length) };
  });
}

export interface TrendSummary {
  deltaPct: number;
  firstRate: number;
  lastRate: number;
  bucketCount: number;
}

/** First-bucket-vs-last-bucket accuracy delta from `accuracyOverTime` — a
 *  cheap "improving / plateaued / slipping" signal without fitting a real
 *  regression, which would be overkill for the bucket counts this app sees. */
export function accuracyTrendDelta(points: AccuracyPoint[]): TrendSummary | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const firstRate = pct(first.correct, first.graded);
  const lastRate = pct(last.correct, last.graded);
  return { deltaPct: (lastRate - firstRate) * 100, firstRate, lastRate, bucketCount: points.length };
}

export interface VolumeStats {
  byDate: { date: string; count: number }[];
  currentStreakDays: number;
  longestStreakDays: number;
}

/** Volume/streak counts any submitted attempt (gradable or not) — this
 *  measures showing-up, not accuracy, so it deliberately does NOT filter
 *  through `isGraded`. */
export function practiceVolume(attempts: AttemptStatsRow[]): VolumeStats {
  const counts = new Map<string, number>();
  for (const a of attempts) {
    if (!a.submittedAt) continue;
    const key = dateKey(a.submittedAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const byDate = [...counts.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));

  const activeDates = new Set(counts.keys());
  let currentStreakDays = 0;
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  // Today not yet having activity doesn't break a streak that ended yesterday.
  if (!activeDates.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (activeDates.has(cursor.toISOString().slice(0, 10))) {
    currentStreakDays += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let longestStreakDays = 0;
  let running = 0;
  let prev: string | null = null;
  for (const { date } of byDate) {
    if (prev) {
      const gapDays = (new Date(date).getTime() - new Date(prev).getTime()) / 86_400_000;
      running = gapDays === 1 ? running + 1 : 1;
    } else {
      running = 1;
    }
    longestStreakDays = Math.max(longestStreakDays, running);
    prev = date;
  }

  return { byDate, currentStreakDays, longestStreakDays };
}

/** Per-exam facts the stats need beyond its name — SAT and PSAT scores sit on different scales and must never be compared. */
export interface ExamMeta {
  name: string;
  /** Short family label: "SAT" or "PSAT". */
  assessment: string;
  sectionMin: number;
  sectionMax: number;
}

export interface ExamScorePoint {
  completedAt: string;
  examId: string;
  examName: string;
  assessment: string;
  sectionMin: number;
  sectionMax: number;
  /** Top of the 2-section total (2 x sectionMax). */
  totalMax: number;
  rwScaled: number | null;
  mathScaled: number | null;
  totalScaled: number;
}

export function examScoreTrend(sessions: ExamSessionStatsRow[], examMeta: (examId: string) => ExamMeta): ExamScorePoint[] {
  return sessions
    .filter((s) => s.totalScaled != null && s.completedAt != null)
    .map((s) => {
      const meta = examMeta(s.examId);
      return { s, meta };
    })
    .map(({ s, meta }) => ({
      completedAt: s.completedAt!,
      examId: s.examId,
      examName: meta.name,
      assessment: meta.assessment,
      sectionMin: meta.sectionMin,
      sectionMax: meta.sectionMax,
      totalMax: meta.sectionMax * 2,
      rwScaled: s.rwScaled,
      mathScaled: s.mathScaled,
      totalScaled: s.totalScaled!,
    }))
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
}

export interface HeadlineTiles {
  totalQuestionsAnswered: number;
  overallAccuracy: number | null;
  avgActiveMs: number;
  currentStreakDays: number;
  latestExamTotalScaled: number | null;
  /** Maximum total for that latest test's scale (1600 SAT, 1520 PSAT) — null when there is none. */
  latestExamTotalMax: number | null;
}

export interface PracticeStats {
  accuracyOverTime: AccuracyPoint[];
  bySkill: SkillRow[];
  byDomain: DomainRow[];
  byDifficulty: DifficultyRow[];
  byQuestionType: QuestionTypeRow[];
  timeVsCorrectness: TimeQuartile[];
  hintImpact: HintImpactRow[];
  reveal: RevealStats;
  secondGuessing: SecondGuessBucket[];
  markForReview: MarkForReviewRow[];
  calculatorUsage: ToolUsageRow[];
  referenceSheetUsage: ToolUsageRow[];
  byTimeOfDay: TimeOfDayRow[];
  trend: TrendSummary | null;
  volume: VolumeStats;
  overallAccuracy: number;
  totalGraded: number;
}

export interface ExamStats {
  scoreTrend: ExamScorePoint[];
  latest: ExamScorePoint | null;
}

/** Everything about "which specific past questions are worth another look"
 *  — pacing and the mark-for-review flag's actual effectiveness — computed
 *  across *both* practice sets and practice tests, unlike `PracticeStats`
 *  (practice-only) and `ExamStats` (exam-only). Those two stay split
 *  because a practice accuracy percentage and an exam's scaled score are
 *  different units that would mislead if averaged together; nothing here
 *  is a mode-specific unit like that; `isCorrect`/`markedForReview`/time-on-
 *  question mean the same thing in both modes (see `pacingEligible`'s
 *  comment on why exam attempts, which can't use hints or reveal, already
 *  satisfy that filter naturally), so combining them is a strictly more
 *  complete answer to "which questions gave this student trouble" instead
 *  of an apples-to-oranges blend. */
export interface PacingStats {
  bySkill: PacingSkillRow[];
  byDomain: PacingDomainRow[];
  slowCorrectQuestions: SlowCorrectQuestion[];
  markForReview: MarkForReviewRow[];
}

export interface Insight {
  id: string;
  severity: "info" | "notice" | "opportunity";
  text: string;
  targetSkillCode?: string;
}

export interface StatsBundle {
  headline: HeadlineTiles;
  practice: PracticeStats | null;
  exam: ExamStats | null;
  pacing: PacingStats | null;
}

export function buildStatsBundle(input: {
  sets: SetStatsRow[];
  examSessions: ExamSessionStatsRow[];
  attempts: AttemptStatsRow[];
  examMeta: (examId: string) => ExamMeta;
}): StatsBundle {
  const modeBySetId = new Map(input.sets.map((s) => [s.id, s.mode]));
  const setNameById = new Map(input.sets.map((s) => [s.id, s.name]));
  const practiceAttempts = input.attempts.filter((a) => modeBySetId.get(a.setId) === "practice");

  const practiceGraded = practiceAttempts.filter(isGraded);
  const practice: PracticeStats | null =
    practiceAttempts.filter((a) => a.submittedAt).length === 0
      ? null
      : {
          accuracyOverTime: accuracyOverTime(practiceAttempts),
          bySkill: bySkill(practiceAttempts),
          byDomain: byDomain(bySkill(practiceAttempts)),
          byDifficulty: byDifficulty(practiceAttempts),
          byQuestionType: byQuestionType(practiceAttempts),
          timeVsCorrectness: timeVsCorrectness(practiceAttempts),
          hintImpact: hintImpact(practiceAttempts),
          reveal: revealRate(practiceAttempts),
          secondGuessing: secondGuessing(practiceAttempts),
          markForReview: markForReviewImpact(practiceAttempts),
          calculatorUsage: calculatorUsage(practiceAttempts),
          referenceSheetUsage: referenceSheetUsage(practiceAttempts),
          byTimeOfDay: byTimeOfDay(practiceAttempts),
          trend: accuracyTrendDelta(accuracyOverTime(practiceAttempts)),
          volume: practiceVolume(practiceAttempts),
          overallAccuracy: pct(practiceGraded.filter((a) => a.isCorrect).length, practiceGraded.length),
          totalGraded: practiceGraded.length,
        };

  const scoreTrend = examScoreTrend(input.examSessions, input.examMeta);
  const exam: ExamStats | null = scoreTrend.length === 0 ? null : { scoreTrend, latest: scoreTrend[scoreTrend.length - 1] };

  const allGraded = input.attempts.filter(isGraded);

  // Combined across both modes — see `PacingStats`'s comment for why that's
  // the right scope here even though `practice`/`exam` above stay split.
  const pacingSkills = pacingBySkill(input.attempts);
  const pacing: PacingStats | null =
    allGraded.length === 0
      ? null
      : {
          bySkill: pacingSkills,
          byDomain: pacingByDomain(pacingSkills),
          slowCorrectQuestions: slowCorrectQuestions(input.attempts, setNameById, modeBySetId),
          markForReview: markForReviewImpact(input.attempts),
        };
  const headline: HeadlineTiles = {
    totalQuestionsAnswered: input.attempts.filter((a) => a.submittedAt).length,
    overallAccuracy: allGraded.length > 0 ? pct(allGraded.filter((a) => a.isCorrect).length, allGraded.length) : null,
    avgActiveMs:
      input.attempts.length > 0
        ? input.attempts.reduce((s, a) => s + a.activeMs, 0) / input.attempts.length
        : 0,
    currentStreakDays: practiceVolume(input.attempts).currentStreakDays,
    latestExamTotalScaled: exam?.latest?.totalScaled ?? null,
    latestExamTotalMax: exam?.latest?.totalMax ?? null,
  };

  return { headline, practice, exam, pacing };
}
