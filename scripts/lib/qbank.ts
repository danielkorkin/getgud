// Shared constants and helpers for scraping the College Board educator
// Question Bank. Pure networking/fs utilities — no DB import belongs here.

import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const QBANK =
  "https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/digital";
export const SAIC = "https://saic.collegeboard.org/disclosed";

export const USER_AGENT =
  "getgud-local-scraper/1.0 (+https://github.com/dkorkin1/getgud; personal local study tool)";

// asmtEventId 101 returns 500; 102 (PSAT 8/9) is a separate bank, out of
// scope per the approved plan (SAT + PSAT/NMSQT only).
export const ASSESSMENTS = [
  { key: "SAT", asmtEventId: 99, program: "SAT", label: "SAT" },
  {
    key: "PSAT10",
    asmtEventId: 100,
    program: "P10",
    label: "PSAT/NMSQT & PSAT 10",
  },
] as const;

export type AssessmentKey = (typeof ASSESSMENTS)[number]["key"];

export const SECTIONS = [
  { test: 1, code: "RW", label: "Reading and Writing", domains: "INI,CAS,EOI,SEC" },
  { test: 2, code: "MATH", label: "Math", domains: "H,P,Q,S" },
] as const;

export type SectionCode = (typeof SECTIONS)[number]["code"];

/** Raw list row shape from POST /get-questions. */
export interface ListRow {
  updateDate: number;
  createDate: number;
  questionId: string;
  skill_cd: string;
  score_band_range_cd: number | null;
  skill_desc: string;
  program: string;
  primary_class_cd_desc: string;
  ibn: string | null;
  external_id: string | null;
  primary_class_cd: string;
  uId: string | null;
  difficulty: string;
  pPcc?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch JSON with retries, exponential backoff + jitter, and Retry-After
 * support. Throws FetchFailed after the last attempt.
 */
export class FetchFailed extends Error {
  constructor(
    public readonly label: string,
    public readonly cause: unknown,
  ) {
    super(`fetch failed for ${label}: ${String(cause)}`);
    this.name = "FetchFailed";
  }
}

export async function fetchJson(
  url: string,
  init: RequestInit,
  label: string,
  attempts = 5,
): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(20_000),
        headers: {
          "User-Agent": USER_AGENT,
          ...(init.headers ?? {}),
        },
      });

      if (res.status === 429 || res.status >= 500) {
        const retryAfter = res.headers.get("retry-after");
        const waitMs = retryAfter
          ? Number(retryAfter) * 1000
          : backoffMs(attempt);
        lastErr = new Error(`HTTP ${res.status} for ${label}`);
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${label}: ${await res.text()}`);
      }

      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < attempts - 1) {
        await sleep(backoffMs(attempt));
      }
    }
  }
  throw new FetchFailed(label, lastErr);
}

function backoffMs(attempt: number): number {
  const base = 500 * 2 ** attempt;
  const jitter = base * 0.3 * (Math.random() * 2 - 1);
  return Math.min(base + jitter, 30_000);
}

/** Write JSON atomically: write to a .tmp file, then rename. Prevents a
 * killed process from leaving a truncated file that skip-if-exists treats
 * as complete. */
export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(value));
  await rename(tmp, path);
}

/** Fixed-size worker pool draining a shared index. No external dependency. */
export async function pool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export const DATA_DIR = "data/raw";
export const LIST_DIR = `${DATA_DIR}/list`;
export const QUESTION_DIR = `${DATA_DIR}/question`;
export const IBN_DIR = `${DATA_DIR}/ibn`;
export const QUARANTINE_DIR = `${DATA_DIR}/_quarantine`;
export const FAILURES_FILE = `${DATA_DIR}/_failures.json`;
