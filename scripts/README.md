# College Board question bank pipeline

Four independent stages. Each reads only what the previous one wrote to
disk — nothing re-fetches over the network unless you explicitly re-run
`scrape`, and `load`/`db:verify` never touch the network at all.

```
pnpm scrape          # network -> data/raw/{list,question,ibn}/   (resumable; only fetches what's missing)
pnpm convert:math    # data/raw/ibn -> data/raw/vision/latex-cache.json   (code only, no network, no AI API)
pnpm load            # data/raw/**  -> Postgres                    (no network; safe to re-run any time, free)
pnpm db:verify       # sanity-checks the loaded database
```

`data/` is gitignored (see `ATTRIBUTION.md`) and, once step 1 has run,
**persists as the source of truth on disk** — `load` reads purely from that
folder. Re-running `pnpm load` (or `pnpm load:upsert`) never re-fetches
anything from College Board; it's a pure folder → db pass, so you can drop
and recreate the database, tweak the contract, or reload as many times as
you want without re-scraping.

Only re-run `pnpm scrape` if you want fresher data from College Board, and
only re-run `pnpm convert:math` after editing
`data/raw/vision/manual-overrides.json` or improving
`scripts/lib/spoken-math.ts`.

See `ATTRIBUTION.md` for what each stage does and why.

`scripts/design-exam.ts` is a separate, downstream tool — it reads the
already-loaded question bank to select ids for a premade exam blueprint
(`src/exams/*.ts`); it isn't part of this four-stage pipeline and never
touches `data/`. See CLAUDE.md's "Premade exams" section.
