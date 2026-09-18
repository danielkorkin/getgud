# Getgud

A local, self-hostable PSAT/SAT practice tool. Practice questions are sourced
from the College Board Question Bank — see [ATTRIBUTION.md](./ATTRIBUTION.md).

## Status

The data pipeline, the practice-tool app, and premade practice tests are all
built. A full SAT and PSAT/NMSQT & PSAT 10 scrape, a code-only
equation-image-to-LaTeX conversion pass, and a Postgres loader (see
[scripts/README.md](./scripts/README.md)) feed a practice-set builder
(`/new`), a Bluebook-style question runner (`/sets/[id]`) with an answer
eliminator, mark-for-review, text highlighting + notes, a resizable
calculator/reference drawer backed by Desmos, instant per-question feedback
rendered from the official rationale, and **Strobi** — a floating procedural
avatar coach whose eyes track your cursor continuously, who reacts to each
submission, gives a one-line AI takeaway, and holds a progressive 3-level
hint ladder (then a confirm-gated answer reveal) and a full post-answer chat
that's saved per question and restored exactly as you left it — plus a set
library (`/sets`), a results screen, local cookie-based profiles (no
password), and telemetry capture for a future stats screen. Alongside that,
`/tests` offers full-length, timed, adaptive SAT practice tests — the same
committed set of questions on every self-hosted copy of Getgud, with
module-scoped timers, routing into an easier or harder second module based
on first-module performance, and a scaled score out of 1600 at the end.

The app is divided into two halves. **Practice** is everything above.
**Learn** (`/learn`) is a study library: original cheat sheets and strategy
guides written for this repo — math formulas split by what Bluebook gives
you versus what you have to memorize, every grammar rule the test actually
tests, a Desmos playbook, reading and question-type strategy, statistics,
pacing, and study plans — alongside a hand-checked shelf of external
resources (College Board's own material, Khan Academy's official free
course, schoolhouse.world's free live tutoring, the best YouTube channels,
Desmos, books, and communities). Every external link was verified by
fetching it and carries the date it was checked. Guides and resources are
tagged with the same domain/skill codes as the questions, so the results
screen links a missed skill straight to the material for it. The Learn half
needs no database and no profile — it works on a fresh clone, before the
scrape has run. See [CLAUDE.md](./CLAUDE.md) for the full architecture and
load-bearing implementation notes.

## From-scratch setup

Everything below assumes a fresh machine — nothing installed, no database,
no data. Total time is dominated by step 4 (the scrape), which is the only
network-heavy, non-resumable-from-zero step.

### 1. Prerequisites

- **Node.js 20.9+** (Next.js's minimum; this repo is developed and tested on
  Node 26.x — see `src/prisma/contract.prisma`'s header comment on why the
  Node version matters for timestamp handling) and **pnpm**
  (`corepack enable` will pick up the pinned `pnpm@11.12.0` from
  `package.json` automatically; otherwise `npm install -g pnpm`).
- **PostgreSQL 15+**, running locally.

  macOS (Homebrew):
  ```bash
  brew install postgresql@17
  brew services start postgresql@17
  createdb getgud
  ```

  Linux (Debian/Ubuntu):
  ```bash
  sudo apt install postgresql
  sudo systemctl enable --now postgresql
  sudo -u postgres createuser -s "$USER"
  createdb getgud
  ```

  Anything that gets you a running server and an empty database works —
  Docker's `postgres:17` image, a managed instance, etc. You just need a
  connection string for it in the next step.

### 2. Clone and install

```bash
git clone https://github.com/danielkorkin/getgud.git
cd getgud
pnpm install
```

### 3. Configure the database connection

```bash
cp .env.example .env
```

Edit `.env` and set `DATABASE_URL` to point at the database from step 1, e.g.
`postgresql://localhost:5432/getgud` (add a user/password if your Postgres
needs one). The two AI/calculator keys further down in `.env.example` are
optional — see [Optional API keys](#optional-api-keys) below; leave them
blank to start.

Then create the schema from the Prisma contract:

```bash
pnpm contract:emit   # compile src/prisma/contract.prisma -> contract.json/.d.ts
pnpm prisma db init  # create tables in DATABASE_URL from the contract
```

### 4. Scrape, convert, and load the question bank

Four independent, resumable stages — see
[scripts/README.md](./scripts/README.md) for what each one does and
[ATTRIBUTION.md](./ATTRIBUTION.md) for sourcing details. Run them in order,
from empty:

```bash
pnpm scrape          # College Board -> data/raw/ (network; resumable, only fetches what's missing)
pnpm convert:math    # equation images -> LaTeX, code only, no network/AI
pnpm load            # data/raw/ -> Postgres (no network; safe to re-run any time)
pnpm db:verify       # sanity-check the loaded database
```

`pnpm scrape` is the slow one (a full SAT + PSAT/NMSQT & PSAT 10 pull) and
writes everything to `data/raw/`, which is gitignored — if it's interrupted,
re-running the same command picks up where it left off instead of
re-fetching from the start. `db:verify` should finish with
`All hard invariants passed.`; if it doesn't, don't proceed to step 5 — fix
the pipeline first (see `scripts/README.md`).

### 5. Run it

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), pick a profile name (no
password), and build a set at `/new`.

### Optional API keys

Both are optional — each feature degrades gracefully (disabled button with an
explanation) if its key is unset:

- `OPENROUTER_API_KEY` — Strobi's hints, reaction takeaways, and post-answer
  chat, via [OpenRouter](https://openrouter.ai/keys).
- `NEXT_PUBLIC_DESMOS_API_KEY` — the runner's calculator, via a free key from
  [desmos.com/api](https://www.desmos.com/api).

## Updating an existing install

After pulling new commits, get the local database and dependencies back in
sync:

```bash
pnpm install                # reinstalls deps and reapplies the patched
                             # @bible-strong/avatar-* packages (see CLAUDE.md)
pnpm contract:emit          # recompile contract.prisma if it changed
pnpm prisma db update       # apply any new columns/tables to your existing DB
```

Then restart `pnpm dev` if it was already running — it loads `contract.json`
once at boot, so it won't see a schema change from `db update` until it's
restarted.

## Stack

- [Next.js](https://nextjs.org) (App Router, Server Actions)
- [Prisma ORM](https://www.prisma.io) (v8, PostgreSQL)
- [shadcn/ui](https://ui.shadcn.com) on [Base UI](https://base-ui.com), Tailwind CSS v4
- [AI SDK](https://ai-sdk.dev) + [`@openrouter/ai-sdk-provider`](https://openrouter.ai) — streaming hints, takeaways, and chat
- [KaTeX](https://katex.org) — server-side math rendering from MathML/LaTeX
- [Desmos API](https://www.desmos.com/api) — in-runner graphing/scientific calculator
- `@bible-strong/avatar-react` / `avatar-core` (patched, AGPL-3.0-only) — Strobi's
  procedural SVG renderer; see [CLAUDE.md](./CLAUDE.md)'s "Patched avatar packages"
