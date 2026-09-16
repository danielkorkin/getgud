import "server-only";

import { db } from "@/prisma/db";
import { toJsonValue } from "@/lib/json";
import { EVENT_TYPES } from "@/lib/event-types";

// Deliberately uses the ORM (`.create()`), not `db.raw.sql` + `param()`.
// Turbopack's dev server bundles Route Handlers separately from Server
// Actions/Components, and `@prisma/orm-postgres`'s `param()` ParamRef only
// satisfies `db.raw.sql`'s interpolation check when both come from the
// same bundle — calling it from code reachable through a route.ts throws
// RUNTIME.RAW_SQL_UNSUPPORTED_INTERPOLATION even though the identical
// query works from a Server Action or a plain script (verified: moving
// the raw-SQL call into its own module didn't help — it's keyed by the
// request's entrypoint, not which file the code lives in). The ORM lane
// doesn't have this problem, and gets us the same "insert, ignore if this
// (attemptId, seq) already exists" idempotency via catching the unique-
// constraint violation (Postgres 23505) instead of `ON CONFLICT DO NOTHING`.
const VALID_TYPES = new Set<string>(EVENT_TYPES);

export interface IncomingEvent {
  seq: number;
  type: string;
  atMs: number;
  clientAt: string;
  payload?: unknown;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    ("sqlState" in error ? error.sqlState === "23505" : false)
  );
}

/** Inserts one event, swallowing a duplicate `(attemptId, seq)` as "already there". Returns whether it was a new row. */
async function insertEvent(params: {
  attemptId: string;
  profileId: string;
  setId: string;
  questionId: string;
  event: IncomingEvent;
}): Promise<boolean> {
  const { attemptId, profileId, setId, questionId, event } = params;
  try {
    await db.orm.public.AttemptEvent.create({
      id: crypto.randomUUID(),
      attemptId,
      profileId,
      setId,
      questionId,
      seq: event.seq,
      type: event.type,
      atMs: Math.trunc(event.atMs),
      clientAt: event.clientAt,
      payload: toJsonValue(event.payload ?? null),
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

export async function ingestEventBatch(params: {
  attemptId: string;
  profileId: string;
  setId: string;
  questionId: string;
  events: IncomingEvent[];
}): Promise<number> {
  let inserted = 0;
  for (const event of params.events) {
    if (!VALID_TYPES.has(event.type) || !Number.isFinite(event.seq) || !Number.isFinite(event.atMs)) continue;
    if (await insertEvent({ ...params, event })) inserted++;
  }
  return inserted;
}
