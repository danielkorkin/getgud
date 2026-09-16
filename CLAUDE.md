@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Getgud is a local, self-hostable PSAT/SAT practice tool: a Next.js app backed
by Postgres via Prisma, an AI SDK integration (OpenRouter, model configurable
via `OPENROUTER_MODEL`), and a scraper that imports questions from the
College Board Question Bank (see `ATTRIBUTION.md`).

**Current state: data pipeline and practice-tool UI both done.** The
`Question` / `QuestionAssessment` contract, the scraper, the math-image →
LaTeX conversion pipeline, and the loader are implemented and have been run
end-to-end against a local Postgres — see `scripts/README.md` for the
pipeline stages and `ATTRIBUTION.md` for what's scraped and how equations are
converted. On top of that: a practice-set builder (`/new`), a Bluebook-style
runner (`/sets/[id]`) with answer eliminator, mark-for-review, text
highlighting + notes, a resizable calculator/reference drawer backed by
Desmos, an AI hint panel, and instant per-question feedback rendered from the
College Board rationale; a set
library (`/sets`) and results screen (`/sets/[id]/results`); local
cookie-based profiles (no auth); and two API routes (`/api/hint` streaming,
`/api/events` telemetry ingest). See "Practice-tool app layer" below for the
data model and load-bearing gotchas.

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
- `src/prisma/contract.prisma` is the source of truth for models — the
  College Board `Question` / `QuestionAssessment` pair plus the app-owned
  practice-tool models (`Profile`, `PracticeSet`, `PracticeSetItem`,
  `Attempt`, `AttemptEvent`, `QuestionHint`, `AttemptHint`).
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

## Practice-tool app layer

Server Actions live in `src/actions/` (`profile.ts`, `sets.ts`,
`attempts.ts`); the two route handlers are `src/app/api/{hint,events}/route.ts`.
Rendering (MathML/LaTeX → KaTeX, sanitized) is `src/lib/content/render.ts` —
see its file comment and `src/lib/content/latex-hygiene.ts` for the small,
verified fixup pass it applies before handing LaTeX to KaTeX. Question
generation/sampling is `src/lib/query/generate-set.ts`.

**`Attempt.id` always equals its `PracticeSetItem.id`, by convention, not a
schema constraint.** `.upsert()` on this ORM conflict-targets the row's
*primary key*, not an arbitrary unique column — keying `Attempt` any other
way (e.g. a fresh `crypto.randomUUID()` with `itemId` as a separate unique
column) makes `upsert()` silently fail to update on a second view. Every
action that reads/writes an `Attempt` looks it up by `{ id: item.id }`.

**Every Server Action / route handler that takes `(setId, position)` must
re-derive ownership itself** — `src/lib/access.ts`'s `getOwnedItem()` (or
`src/lib/profile.ts`'s `requireProfileId()`) does this; never trust a bare id
from the client. "No password" profiles are still not "no authorization."

**`db.raw.sql` + `param(...)` from `@prisma/orm-postgres/relational-core`
does not work when called from code reachable through a Route Handler
(`app/api/*/route.ts`) under Turbopack dev** — it throws
`RUNTIME.RAW_SQL_UNSUPPORTED_INTERPOLATION` even for a query that works
byte-for-byte from a Server Action or a plain script (Route Handlers and
Server Actions land in different Turbopack dev bundles, and the ParamRef
only satisfies the interpolation check within the bundle that produced it).
Moving the raw-SQL call into its own module doesn't help — it's keyed by
the request's entrypoint, not which file the code lives in. Fix: use the
ORM (`db.orm.public.<Model>.create(...)`) from anything invoked via a route
handler, not `db.raw.sql`/`param()`. See `src/lib/ingest-events.ts`'s file
comment. (`generate-set.ts`'s `param()` usage is fine — everything there
runs through Server Actions.)

**Base UI's `ToggleGroup` defaults to `multiple={false}` (single-select)** —
unlike Radix's `type="multiple"` convention. Forgetting `multiple` on a
multi-select toggle group (see `set-builder-form.tsx`) makes every click
collapse the group to just the clicked item, with no error.

**`@phosphor-icons/react`'s default export is client-only** — importing it
in a Server Component (a page with no `"use client"`) crashes the build with
`(0, b.createContext) is not a function`. Server Components must import from
`@phosphor-icons/react/dist/ssr` instead (same icon names). Client components
use the bare import, matching the installed `shadcn/ui` components.

**Icons need an explicit `size-*` class outside a shadcn `Button`.**
`Button`'s own class list carries a Tailwind arbitrary-variant rule
(`[&_svg:not([class*='size-'])]:size-4`) that auto-sizes any icon rendered
as its child — icons inside custom hand-rolled interactive elements (a
plain `<button>`, a `CollapsibleTrigger`, etc.) don't get that rule and
render at Phosphor's unconstrained intrinsic size (visually enormous) unless
you add `size-4` (or similar) yourself.

**`::highlight()` (the CSS Custom Highlight API, used for passage/stem text
highlighting in the runner) fails a production build if it's in
`globals.css`** — Turbopack's build-time CSS parser (Lightning CSS) doesn't
recognize the pseudo-element yet, even though every browser that implements
the API parses it fine at runtime. The rule lives in
`highlightable.tsx` as a runtime `<style>` tag instead.

**`DesmosCalculator` (`desmos-calculator.tsx`) must stay mounted for the
life of the runner, never conditionally rendered per-drawer** — `next/script`'s
`onLoad` callback only fires on the script's first-ever load. If the
component unmounts and remounts after the Desmos script is already cached
(e.g. a naive `{activeDrawer === "calculator" && <DesmosCalculator />}`),
`onLoad` never fires again, the `ready` state never flips back to true, and
the calculator renders permanently blank. `practice-runner.tsx` keeps every
drawer panel (`calculator`/`reference`/`hint`/`notes`) mounted at all times
and toggles visibility with `hidden` instead — see its comment above the
`<aside>`.

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
