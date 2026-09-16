# Getgud

A local, self-hostable PSAT/SAT practice tool. Practice questions are sourced
from the College Board Question Bank — see [ATTRIBUTION.md](./ATTRIBUTION.md).

## Status

The data pipeline is implemented: a full SAT and PSAT/NMSQT & PSAT 10 scrape,
a code-only equation-image-to-LaTeX conversion pass, and a Postgres loader —
see [scripts/README.md](./scripts/README.md). The practice-tool UI itself
hasn't been built yet. See [CLAUDE.md](./CLAUDE.md) for the current state of
the codebase.

## Getting started

```bash
pnpm install
cp .env.example .env   # then fill in DATABASE_URL
pnpm contract:emit
pnpm prisma db init
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

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

- [Next.js](https://nextjs.org) (App Router)
- [Prisma ORM](https://www.prisma.io) (v8, PostgreSQL)
- [shadcn/ui](https://ui.shadcn.com) on [Base UI](https://base-ui.com), Tailwind CSS v4
- [AI SDK](https://ai-sdk.dev) — dependency installed, not yet wired up
