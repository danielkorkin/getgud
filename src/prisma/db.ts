import 'dotenv/config';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };

// Next.js dev (Fast Refresh) re-evaluates this module on nearly every save
// without restarting the process. Without a globalThis-cached singleton,
// each re-evaluation would construct a fresh pg.Pool on top of the old one,
// eventually exhausting Postgres's connection limit. Stash the client on
// globalThis so HMR reuses it; in production this module only ever
// evaluates once, so the cache is a no-op there.
const globalForDb = globalThis as unknown as { __getgudDb?: ReturnType<typeof postgres<Contract>> };

export const db =
  globalForDb.__getgudDb ??
  postgres<Contract>({
    contractJson,
    url: process.env['DATABASE_URL']!,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__getgudDb = db;
}
