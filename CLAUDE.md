@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Getgud is a local, self-hostable PSAT/SAT practice tool: a Next.js app backed
by Postgres via Prisma, an AI SDK integration (model provider not yet
chosen), and a scraper that imports questions from the College Board
Question Bank (see `ATTRIBUTION.md`).

**Current state: data pipeline done, practice-tool UI not started.** The
`Question` / `QuestionAssessment` contract, the scraper, the math-image →
LaTeX conversion pipeline, and the loader are all implemented and have been
run end-to-end against a local Postgres — see `scripts/README.md` for the
pipeline stages and `ATTRIBUTION.md` for what's scraped and how equations are
converted. What does **not** exist yet: any practice-tool page, component, or
API route, and the AI SDK integration (the `ai` package is installed but
unwired). Don't assume UI/app-layer domain logic exists; check before
referencing it — the data layer is the only part that's real so far.

## Commands

```bash
pnpm dev             # start dev server (Turbopack)
pnpm build           # production build (also runs `tsc` type-check)
pnpm start           # run a production build
pnpm lint            # eslint
pnpm contract:emit   # regenerate src/prisma/contract.json + contract.d.ts after editing contract.prisma
pnpm prisma db init          # create tables in the database from the contract
pnpm prisma migration status # show migration status

# College Board data pipeline — see scripts/README.md for details
pnpm scrape          # network -> data/raw/{list,question,ibn}/ (resumable)
pnpm convert:math    # data/raw/ibn -> data/raw/vision/latex-cache.json (code only, no network/AI)
pnpm load            # data/raw/** -> Postgres (no network; safe to re-run any time)
pnpm db:verify       # sanity-check the loaded database
```

There is no test runner configured yet.

## Skills

This repo has a large number of Skills installed under `.claude/skills/`
(and mirrored to `.agents/`, `.cursor/`, `.devin/` for other tools) —
`shadcn`, `ai-sdk`, `prisma-8`, `prisma-client-api`, `prisma-database-setup`,
Next.js/React/design skills, etc. Prefer invoking the matching Skill over
answering from general knowledge whenever a task touches one of these
libraries — several (`prisma-8` in particular) describe a specific
release-candidate version that predates training data, so they're the
source of truth here, not a fallback.

## Prisma 8: this is not classic Prisma

This project uses Prisma ORM v8 (currently a release candidate), which
replaces `schema.prisma` + `prisma generate` with a different model. **Use
the `prisma-8` Skill** before touching anything Prisma-related (contract
edits, migrations, queries, `db.ts`, debugging a dotted error code) — it
routes to the right reference file and is kept in sync with the installed
version via `prisma skills sync`, so it's more current than training data
or `prisma-8.md` (root-level, quickstart-only) alone.

The short version:
- `src/prisma/contract.prisma` is the source of truth for models (currently empty).
- `pnpm contract:emit` compiles it into `src/prisma/contract.json` (data) and
  `src/prisma/contract.d.ts` (types) — both are committed, generated files
  (see `.gitattributes`), never hand-edited.
- `src/prisma/db.ts` builds the client from those generated files:
  `db.orm.public.<Model>...`. There is no `PrismaClient` import anywhere.
- `prisma.config.ts` points the CLI at the contract and reads `DATABASE_URL`
  from `.env` (see `.env.example`). `@prisma/cli-engine` must stay an
  explicit `devDependency` — `prisma.config.ts` imports it directly, and
  pnpm's strict `node_modules` won't resolve it otherwise (this was the
  original scaffold bug; don't reintroduce it by removing the dependency).
- `@prisma/orm-postgres` and `prisma` are independently versioned release
  candidates; if `pnpm contract:emit` or `pnpm build` starts failing with a
  module-resolution error again, suspect a version-skew regression here
  before assuming your own code is wrong.

## UI stack

- shadcn/ui is configured with the `base-nova` style on **Base UI**, not
  Radix (`components.json`: `"style": "base-nova"`) — component APIs differ
  from Radix-based shadcn docs/examples.
- Tailwind CSS v4, config lives in `src/app/globals.css` (no `tailwind.config.*`
  file). Design tokens are CSS variables under `@theme inline`.
- Path alias `@/*` → `src/*` (see `tsconfig.json` / `components.json` aliases).

## Data model — Question / QuestionAssessment

`src/prisma/contract.prisma` defines two models, populated by the scripts
below (not app code — no page reads from them yet):

- `Question` — one row per unique question (keyed by `externalId` or `ibn`),
  content only. `contentSource` is `'qbank'` (live API, real MathML) or
  `'saic'` (disclosed items, equations were originally images — see below).
- `QuestionAssessment` — one row per `(assessment, question)` placement.
  Deliberately separate from `Question`: the same question can carry a
  *different* `difficulty`/`scoreBand` on SAT vs. PSAT/NMSQT & PSAT 10.

## College Board scraper + math conversion

`scripts/` (see `scripts/README.md` for the pipeline and `ATTRIBUTION.md` for
sourcing/attribution) scrapes the full SAT and PSAT/NMSQT & PSAT 10 banks and
loads them into Postgres. The one non-obvious piece: `saic`-sourced equations
arrive as pre-rendered images, not markup. `scripts/convert-math.ts` converts
them to real LaTeX with **no AI API calls** — first by reading the image's
own embedded MathML source (these PNGs are stamped with it by the rendering
tool, not OCR'd), then with a real recursive-descent parser
(`scripts/lib/spoken-math.ts`) over College Board's alt-text description that
never guesses: an ambiguous or malformed input throws rather than emitting
wrong-looking math. ~97% of equations resolve this way; the remainder keep
their plain-text alt description rather than being dropped. Load-bearing
detail if you touch this code: an earlier, more permissive version of the
implicit-multiplication rule in `spoken-math.ts` silently turned prose like
"f of x" into "fofx" — treat any parser change here as a correctness change,
not just a coverage change, and check for that failure mode (a real English
word landing untranslated in the LaTeX output) before widening what the
grammar accepts.

## Repo layout notes

- `.agents/skills/`, `.claude/skills/`, `.cursor/skills/`, `.devin/skills/`
  are vendored agent skill packages (tracked by `skills-lock.json`, plus the
  Prisma skills synced by `prisma skills sync`), not application code —
  excluded from `eslint` and irrelevant to app behavior.
- `src/prisma/contract.json` and `contract.d.ts` are also excluded from
  `eslint` — they're generated; that's expected, not a bug to fix by
  hand-editing the generated output.
- `data/` (scraped content, the equation-conversion cache) is gitignored —
  see `ATTRIBUTION.md`. Nothing under it is committed or redistributed.
- `public/` is currently empty; the default `create-next-app` SVGs were removed.
