import type { JsonValue } from "@prisma/orm-postgres/target/codec-types";

/**
 * Coerce an application-typed value (a plain interface/array, not
 * necessarily satisfying the structural `JsonValue` index-signature check)
 * into what a `Jsonb` column write expects. A serialize round-trip is the
 * simplest correct way to get there — it also guarantees the value really
 * is JSON-safe (no `undefined`, no class instances) before it hits the DB.
 */
export function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
