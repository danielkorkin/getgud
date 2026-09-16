# Getgud

A local, self-hostable PSAT/SAT practice tool. Practice questions are sourced
from the College Board Question Bank — see [ATTRIBUTION.md](./ATTRIBUTION.md).

## Status

Both the data pipeline and the practice-tool app are built. A full SAT and
PSAT/NMSQT & PSAT 10 scrape, a code-only equation-image-to-LaTeX conversion
pass, and a Postgres loader (see [scripts/README.md](./scripts/README.md))
feed a practice-set builder (`/new`), a Bluebook-style question runner
(`/sets/[id]`) with an answer eliminator, mark-for-review, text highlighting +
notes, a resizable calculator/reference drawer backed by Desmos, an AI hint
panel, and instant per-question feedback rendered from the official
rationale — plus a set library (`/sets`), a results screen, local
cookie-based profiles (no password), and telemetry capture for a future
stats screen. See [CLAUDE.md](./CLAUDE.md) for the full architecture and
load-bearing implementation notes.

## Getting started

```bash
pnpm install
cp .env.example .env   # then fill in DATABASE_URL (see below for optional keys)
pnpm contract:emit
pnpm prisma db init
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), pick a profile name (no
password), and build a set at `/new`.

### Optional API keys

Both are optional — each feature degrades gracefully (disabled button with an
explanation) if its key is unset:

- `OPENROUTER_API_KEY` — AI hint panel, via [OpenRouter](https://openrouter.ai/keys).
- `NEXT_PUBLIC_DESMOS_API_KEY` — the runner's calculator, via a free key from
  [desmos.com/api](https://www.desmos.com/api).

### Loading question data

```bash
pnpm scrape          # College Board -> data/raw/ (resumable; only fetches what's missing)
pnpm convert:math    # equation images -> LaTeX, code only, no network/AI
pnpm load            # data/raw/ -> Postgres
pnpm db:verify        # sanity-check the result
```

See [scripts/README.md](./scripts/README.md) for what each stage does and
[ATTRIBUTION.md](./ATTRIBUTION.md) for sourcing details. `data/` is
gitignored — nothing scraped is committed or redistributed.

## Stack

- [Next.js](https://nextjs.org) (App Router, Server Actions)
- [Prisma ORM](https://www.prisma.io) (v8, PostgreSQL)
- [shadcn/ui](https://ui.shadcn.com) on [Base UI](https://base-ui.com), Tailwind CSS v4
- [AI SDK](https://ai-sdk.dev) + [`@openrouter/ai-sdk-provider`](https://openrouter.ai) — streaming hint generation
- [KaTeX](https://katex.org) — server-side math rendering from MathML/LaTeX
- [Desmos API](https://www.desmos.com/api) — in-runner graphing/scientific calculator
