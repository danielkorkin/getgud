# Attribution

Getgud draws its PSAT/SAT practice questions from the **College Board
Question Bank**. The College Board owns the PSAT/NMSQT, PSAT 10, PSAT 8/9,
and SAT question content, and "College Board," "SAT," and "PSAT" are
trademarks owned by the College Board, which is not affiliated with and does
not endorse this project.

## Scraper

`scripts/scrape.ts` and `scripts/load.ts` (see `scripts/lib/`) pull the full
SAT and PSAT/NMSQT & PSAT 10 question banks from College Board's public
educator Question Bank API and load them into the local Postgres database
(`Question` / `QuestionAssessment` in `src/prisma/contract.prisma`).

- **Local, personal use only.** Scraped content is written to `data/raw/`,
  which is gitignored (`.gitignore`) and never committed or redistributed.
  The database itself is local-only and is not shipped with the project.
- **Source distinction.** Most questions (~88%) come from the live
  `get-questions`/`get-question` API and carry real MathML markup for
  equations. A minority (~12%, all Math) are disclosed/released exam items
  served from `saic.collegeboard.org` as legacy HTML with equations
  pre-rendered as images — these are **disclosed released-exam content**,
  more clearly College Board IP than the general educator-bank practice
  items, and are flagged `contentSource = 'saic'` in the `Question` table.
- Before scraping again or changing how this data is used (e.g. shipping any
  of it with the project), reconfirm the current College Board Terms of
  Service permit the intended use.

## Equation-to-LaTeX conversion

The disclosed/`saic` items render every equation as a pre-rendered image
rather than markup. `scripts/convert-math.ts` (see `scripts/lib/`) converts
these to real LaTeX, code-only, with no AI/API calls, in priority order:

1. **The image's own embedded MathML.** These PNGs are rendered by a
   MathType/WIRIS-style tool that stamps its original MathML source into the
   file as a standard PNG text chunk — reading it back out is not OCR, it's
   the exact source the renderer used (`scripts/lib/png-mathml.ts` +
   `mathml-to-latex.ts`). 51 of 2,818 unique equation images carry this.
2. **A real parser over College Board's own alt-text description**
   (`scripts/lib/spoken-math.ts`) — a recursive-descent grammar, not a regex
   substitution, so nested fractions/roots/exponents resolve correctly
   without guessing. It never emits a guess: anything it can't fully and
   unambiguously consume throws, rather than producing plausible-but-wrong
   math. Resolves ~2,685 of the remainder.

The ~74 images neither method resolves keep their original alt-text
description (accurate, just not LaTeX) rather than being dropped. A handful
with no alt text at all (verified: 8) were transcribed by hand after visual
inspection and recorded in `data/raw/vision/manual-overrides.json`.

`data/raw/vision/needs-review/` holds the decoded PNGs for anything still
unresolved, for further manual/vision transcription — gitignored along with
the rest of `data/raw/`, so no College Board image content is committed.
