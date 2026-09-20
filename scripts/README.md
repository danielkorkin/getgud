# College Board question bank pipeline

Four independent stages (plus a fifth, `embed`, layered on top for "View
similar problems" — see below). Each reads only what the previous one wrote
to disk — nothing re-fetches over the network unless you explicitly re-run
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

## Stage 5: embeddings for "View similar problems" (`pnpm embed`)

`pnpm embed` (`scripts/embed-questions.ts`) is a fifth stage, separate from
the four above in one important way: it reads **Postgres**, not `data/` — run
it any time after `pnpm load` (and again after any `pnpm load`/`load:upsert`
re-run that changes question content). Requires `OPENROUTER_API_KEY` in
`.env`; embedding all ~3,767 questions costs about $0.15–0.20 with the
default model (`google/gemini-embedding-2`) and takes a few minutes.

Resumable and idempotent like the rest of the pipeline: a question is
skipped once it already has a stored embedding whose `contentHash` matches
the current row, so a re-run after `load:upsert` only re-embeds what
actually changed. `--dry-run` prints the question/token/cost estimate
without calling the API or writing anything; `--limit=N` caps how many get
embedded; `--force` re-embeds everything regardless of `contentHash`.

Without `OPENROUTER_API_KEY` set, `pnpm embed` simply isn't runnable (same
posture as the hint/coach features) — the app works fine without it, it
just means "View similar problems" doesn't appear anywhere in the UI
(`similarSearchAvailable()` in `src/lib/query/similar-questions.ts` gates it
off whenever `question_embedding` is empty). See CLAUDE.md's "Similar
problems" note for the model/text-variant choice and why it isn't shared
with the sibling `or-emb` benchmark project's own cached vectors.

**Restart `pnpm dev` after re-running `pnpm embed` against a DB that already
had embeddings** — the similarity index is loaded once and cached in process
memory (`src/lib/query/similar-questions.ts`); a dev server already running
when you add or update embeddings won't see the change until restarted. The
very first `pnpm embed` (on a database with no `question_embedding` rows
yet) needs no restart — an empty index is deliberately never cached, so the
next request after the run picks the new rows up on its own.

## Resetting user data without re-running the pipeline

`pnpm db:reset-users` (`scripts/reset-user-data.ts`) is unrelated to the
pipeline above — it wipes every `profile` row and, via cascading foreign
keys, everything that hangs off one (`practice_set`, `attempt`,
`exam_session`, etc.), while leaving `question`/`question_assessment` (this
pipeline's output) and `question_hint` (the AI hint cache, shared across
profiles) untouched. Dry-run by default; pass `--yes` to actually execute.

See `ATTRIBUTION.md` for what each stage does and why.

`scripts/design-exam.ts` is a separate, downstream tool — it reads the
already-loaded question bank to select ids for a premade exam blueprint
(`src/exams/*.ts`); it isn't part of this four-stage pipeline and never
touches `data/`. See CLAUDE.md's "Premade exams" section.
