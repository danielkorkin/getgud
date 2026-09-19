import 'dotenv/config';
import postgres from '@prisma/orm-postgres/runtime';
import { param as rawParam } from '@prisma/orm-postgres/relational-core';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };

// Next.js dev (Fast Refresh) re-evaluates this module on nearly every save
// without restarting the process. Without a globalThis-cached singleton,
// each re-evaluation would construct a fresh pg.Pool on top of the old one,
// eventually exhausting Postgres's connection limit. Stash the client on
// globalThis so HMR reuses it; in production this module only ever
// evaluates once, so the cache is a no-op there.
//
// `param` is cached in the same slot, for a different reason: Turbopack's
// dev server bundles each route/action entrypoint separately, which can
// give `@prisma/orm-postgres/relational-core` a distinct module instance
// per bundle. `db.raw.sql`'s interpolation check does `value instanceof
// ParamRef`, so a `param(...)` call whose `ParamRef` class came from a
// different bundle than the one that built `db` fails that check even
// though it's the same npm package — RUNTIME.RAW_SQL_UNSUPPORTED_INTERPOLATION,
// "wrap this value in param(...) with an explicit codec", on a value that
// already went through param(...). Re-exporting the exact `param` bound to
// this module's own `db` — and requiring every caller to import it from
// here instead of the package directly — guarantees the `ParamRef` class
// always matches whatever `db.raw.sql` checks against, regardless of which
// bundle happened to evaluate this module first.
const globalForDb = globalThis as unknown as {
  __getgudDb?: { db: ReturnType<typeof postgres<Contract>>; param: typeof rawParam };
};

const cached =
  globalForDb.__getgudDb ??
  {
    db: postgres<Contract>({
      contractJson,
      url: process.env['DATABASE_URL']!,
    }),
    param: rawParam,
  };

export const db = cached.db;
export const param = cached.param;

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__getgudDb = cached;
}
