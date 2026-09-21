@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Getgud is a local, self-hostable PSAT/SAT practice tool: a Next.js app backed
by Postgres via Prisma, an AI SDK integration (OpenRouter, model configurable
via `OPENROUTER_MODEL`), and a scraper that imports questions from the
College Board Question Bank (see `ATTRIBUTION.md`).

**Current state: data pipeline, practice-tool UI, and premade practice tests
all done.** The `Question` / `QuestionAssessment` contract, the scraper, the
math-image → LaTeX conversion pipeline, and the loader are implemented and
have been run end-to-end against a local Postgres — see `scripts/README.md`
for the pipeline stages and `ATTRIBUTION.md` for what's scraped and how
equations are converted. On top of that: a practice-set builder (`/new`), a
Bluebook-style runner (`/sets/[id]`) with answer eliminator, mark-for-review,
text highlighting + notes, a resizable calculator/reference drawer backed by
Desmos, instant per-question feedback rendered from the College Board
rationale, and Strobi — a floating procedural-avatar coach that reacts to
each submission, gives a one-line AI takeaway before you move on, and holds
a progressive 3-level hint ladder (then a confirm-gated answer reveal) and a
full post-answer chat, all with the model's reasoning turned off; a set
library (`/sets`) and results screen (`/sets/[id]/results`); local
cookie-based profiles (no auth); three API routes (`/api/hint` and
`/api/coach` streaming, `/api/events` telemetry ingest); a second, formal
practice mode —
premade, full-length, timed, adaptive SAT practice tests (`/tests`,
`/tests/[sessionId]`, `/tests/[sessionId]/results`) that are identical on
every self-hosted instance, letting a student choose which section goes
first and optionally take the two sections in separate sittings, with a
scaled score shown for a section as soon as it's finished; and a deep
statistics page (`/stats`) that
aggregates every practice set and practice test into charts, rule-based
insights, and an on-demand AI analysis that can also mine past coach
conversations for recurring trouble and generate new targeted practice sets
in one click; a third way to reach a question, a Bluebook-style browser over
the whole bank (`/problems`) with a sticky active-set bar for hand-picking
questions into a set; and, layered on top of that browser, an optional
"View similar problems" (`pnpm embed` populates a per-question embedding
table, gated off entirely when it hasn't been run) that re-ranks the same
browser by content similarity from any question, reachable from `/problems`
itself, the post-answer feedback in the runner, and the set results page.
See "Practice-tool app layer" below for the data model and load-bearing
gotchas, "Premade exams" for the exam system specifically, "Problems
database" for the browser, "Similar problems (embeddings)" for that
feature, and "Statistics & AI analysis" for `/stats`.

## Commands

```bash
pnpm dev             # start dev server (Turbopack)
pnpm build           # production build (also runs `tsc` type-check)
pnpm start           # run a production build
pnpm lint            # eslint
pnpm contract:emit   # regenerate src/prisma/contract.json + contract.d.ts after editing contract.prisma
pnpm prisma db init          # create tables in the database from the contract (fresh DB)
pnpm prisma db update        # apply a contract change to an existing DB (run after `contract:emit`, following a pull)
                              #   — a running `pnpm dev` loads contract.json once at boot; restart it after
                              #     `db update`, or its ORM client won't know about the new column/table.
pnpm prisma migration status # show migration status

# College Board data pipeline — see scripts/README.md for details
pnpm scrape          # network -> data/raw/{list,question,ibn}/ (resumable)
pnpm convert:math    # data/raw/ibn -> data/raw/vision/latex-cache.json (code only, no network/AI)
pnpm load            # data/raw/** -> Postgres (no network; safe to re-run any time)
pnpm db:verify       # sanity-check the loaded database
pnpm embed           # Postgres -> per-question embeddings for "View similar problems" (needs OPENROUTER_API_KEY; optional, resumable)
pnpm db:reset-users  # wipe every profile + practice/exam history; keeps the question bank and hint cache — dry-run by default, pass --yes to execute

# Premade exam blueprints — see "Premade exams" below
pnpm design:exam --exam=<id> --seed=<s>   # deterministic, read-only question selection; prints a paste-ready id list
pnpm design:exam --verify                  # re-check every committed blueprint's invariants against the live DB
```

There is no test runner configured yet.

## From-scratch setup

Full prose version (Postgres install per-OS, etc.) is in `README.md`'s
"From-scratch setup" section — this is the command sequence only, for
bootstrapping a fresh checkout end to end:

```bash
# 1. Postgres must already be running with an empty database (README has
#    per-OS install commands). Then:
pnpm install
cp .env.example .env
# edit .env: set DATABASE_URL to that database; leave OPENROUTER_API_KEY /
# NEXT_PUBLIC_DESMOS_API_KEY blank unless you have keys for them

# 2. Schema
pnpm contract:emit    # contract.prisma -> contract.json/.d.ts (must run before db init)
pnpm prisma db init   # create tables from the contract

# 3. Data pipeline — must run in this order, each stage reads only what the
#    previous one wrote to disk (see scripts/README.md)
pnpm scrape           # network, resumable — the only slow/network step
pnpm convert:math     # code only, no network/AI
pnpm load             # data/raw/ -> Postgres, no network
pnpm db:verify        # must end with "All hard invariants passed." before continuing
pnpm embed            # optional: needs OPENROUTER_API_KEY, enables "View similar problems"

# 4. Run
pnpm dev
```

Skipping straight to `pnpm dev` without steps 2–3 leaves every table empty
(no build/type error — the app just has nothing to query), and skipping
`contract:emit` before `db init` runs `db init` against stale generated
files. If `db:verify` fails, stop and fix the pipeline rather than loading
the app against a database you haven't confirmed is sane.

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
- `recharts` (via shadcn's `chart` wrapper, `src/components/ui/chart.tsx`) is
  used only under `/stats` — see "Statistics & AI analysis" for a load-bearing
  animation gotcha before adding another chart.

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

`scripts/lib/html.ts`'s `decodeHtmlEntities` (shared by every plain-text
consumer, including `toPlainText`'s hint/coach/stats AI prompts) only ever
decoded a hand-picked set of named entities — any named entity missing from
`NAMED_ENTITIES` was silently passed through verbatim rather than decoded,
which for a while meant real content shipped into an LLM prompt as, e.g.,
literal `"Medell&iacute;n"` instead of `"Medellín"`. Found via a scan of the
actual bank's `stem`/`stimulus`/`rationale`/`answerOptions` text for every
`&word;`-shaped entity; the table now covers what that scan found (accented
Latin letters, `copy`, `micro`, curly-quote/dash variants, etc.) plus each
letter's missing case pair. If you see an untranslated `&xyz;` in rendered
or AI-prompt text again, the fix is here, not in the caller — add the
missing entry rather than special-casing the caller.

## Practice-tool app layer

Server Actions live in `src/actions/` (`profile.ts`, `sets.ts`,
`attempts.ts`, `exams.ts`); the three route handlers are
`src/app/api/{hint,coach,events}/route.ts`. The coach (`src/components/practice/coach/`,
`src/lib/ai/coach-prompt.ts`) is the client of `/api/coach`: floating avatar,
reaction bubble, hint ladder, and post-answer chat — see its file comments
for the mood state machine and why the reaction effect defers its `setState`
calls a tick (avoiding `react-hooks/set-state-in-effect`, same idiom as
`set-builder-form.tsx`'s count-loading effect). The avatar's eyes follow the
cursor continuously (`continuous-gaze.ts`'s `useCursorGaze`) — see
"Patched avatar packages" below for how, and why that needed a patch. The
post-answer chat persists to `Attempt.chatMessages` (a `Jsonb?` column, same
shape as `highlights`) via `saveCoachChat` after every completed turn and on
"Clear chat" (called with `[]`) — restoring it exactly on a later visit is
just `getRenderedItem` reading that column back, no extra query. Like every
other coach/hint action, `saveCoachChat` calls `getOwnedItem` with no policy
argument, closing it to exam-mode sets.

The runner's header timer (`live-timer.tsx`'s `LiveTimer`) freezes the
instant a question is answered — pass `frozenMs` (from `SubmitAnswerResult`/
`RenderedItemResult.attempt.totalMs`, the same server-recomputed value
`submitAnswer`/`revealAnswer` already persist) and it stops its interval
entirely rather than continuing to tick while the student reads the
rationale or chats with the coach. `Attempt.totalMs` was already tracked for
analytics; this only had to expose it to the client and freeze the display.
Rendering (MathML/LaTeX → KaTeX, sanitized) is `src/lib/content/render.ts` —
see its file comment and `src/lib/content/latex-hygiene.ts` for the small,
verified fixup pass it applies before handing LaTeX to KaTeX. `render.ts`
also runs a `wrapTables` pass after DOMPurify that wraps any `<table>` in a
stimulus/stem (real College Board markup — DOMPurify already lets it
through, nothing generates it) in a `.qbank-table-wrap` scroll container and
strips the legacy `border` attribute, so a wide data table doesn't overflow
a narrow runner pane or double up borders with the `.qbank-table-wrap` rules
in `globals.css`. Question generation/sampling is
`src/lib/query/generate-set.ts`.

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

**Always import `param` from `@/prisma/db`, never straight from
`@prisma/orm-postgres/relational-core`** — the latter intermittently throws
`RUNTIME.RAW_SQL_UNSUPPORTED_INTERPOLATION` ("wrap this value in `param(...)`
with an explicit codec") on a value that already went through `param(...)`.
Cause: `db.ts` caches the postgres client on `globalThis` so Turbopack-dev
HMR reuses one `pg.Pool` (see its file comment) — but Turbopack bundles each
route/action entrypoint separately, so whichever entrypoint evaluates
`db.ts` *first* after a restart is the one whose `@prisma/orm-postgres`
module instance builds `db`, and `db.raw.sql`'s interpolation check does
`value instanceof ParamRef` against *that* instance's `ParamRef` class.
Every other entrypoint gets the cached `db` back from `globalThis`, but if
it imports `param` from the package directly it gets its *own* bundle's
`ParamRef` class — same npm package, different class identity, so the
`instanceof` check fails on every array/list param even though the value
is unmistakably a `ParamRef`. This is order-dependent (whichever route or
action happens to load first after a restart "wins"), which is why it can
look like it only affects route handlers, or only Server Actions, on a
given run — it's neither; it affects any caller whose `param` didn't come
from the cached instance. Fix (already applied in `db.ts`): cache `param`
in the same `globalThis` slot as `db` and re-export it, so every bundle
gets back the exact `param` bound to whichever `db` actually got cached.
`src/lib/query/generate-set.ts` and `src/actions/exams.ts` import
`{ db, param }` from `@/prisma/db` for this reason — don't reintroduce a
direct `@prisma/orm-postgres/relational-core` import for `param` anywhere.
(`src/lib/ingest-events.ts` sidesteps the whole class of bug by using the
ORM instead of raw SQL — see its file comment — which is still the right
call there, but isn't required elsewhere now that `param` is pinned.)
Restart `pnpm dev` after pulling a change to `db.ts`'s cache shape — HMR
reusing an old-shaped cached object here breaks `db` until a full restart.

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

## Patched avatar packages

`@bible-strong/avatar-core` and `@bible-strong/avatar-react` are **patched**
via pnpm (`patches/*.patch`, registered under `patchedDependencies` in
`pnpm-workspace.yaml`). `pnpm install` reapplies them; don't hand-edit
`node_modules`. To change a patch, run
`pnpm patch @bible-strong/avatar-react@0.1.0`, edit the printed directory,
then `pnpm patch-commit <that directory>`. Both packages are AGPL-3.0-only.

**What the patch adds: a continuous `eyeOffset` that is independent of the
expression and animation systems.** The published React component only
accepts *named* expression/animation keys, so the eyes can only ever be
where some author-defined expression put them. `avatar-core`'s geometry
layer, though, already supports a free-form eye offset —
`RenderAvatarOptions.eyeOffset`, applied additively to each pupil in
head-surface units before the shape is rotated and projected — but nothing
ever threaded it up through `renderAvatarFrame` to React. The patch wires
that path (`renderAvatarExpression` and `renderAvatarFrame` each take an
optional `eyeOffset`) and exposes it as an `eyeOffset` prop plus an
imperative `AvatarController.setEyeOffset(offset)` / `getEyeOffset()`.

Three properties worth knowing, because the coach depends on all of them:
- It is **orthogonal to playback** — it never changes the active expression
  or animation, and unlike `play`/`setExpression` it is deliberately *not*
  refused when the component is controlled by props. So the eyes keep
  tracking during reaction animations.
- It **repaints without a React re-render**: the component already applies
  each frame imperatively via refs, so `setEyeOffset` just re-applies the
  scene. Safe to call at pointer-move or animation-frame rate.
- It is genuinely continuous — a 1.5-unit offset renders differently from a
  0-unit one, so there is no bucketing anywhere in this path.

Before this existed, cursor tracking here was faked by snapping between
pre-baked directional expressions. If you ever need something similar again,
note the constraint that forced the patch: `createAvatar` validates its
definition once and renders from a **deep-frozen clone**, so injecting
expressions into `strobiDefinition` at runtime does nothing (the avatar logs
`[Avatar] Unknown expression '<key>'` and ignores it).

## Premade exams

A second, formal practice mode alongside random-sampled practice sets:
full-length, adaptive, timed SAT practice tests that are byte-identical on
every self-hosted instance, because a test is a committed list of College
Board question ids (`src/exams/sat-practice-1.ts`, `src/exams/sat-smoke.ts`
— a 3-question/1-minute dev-only blueprint for fast end-to-end testing of
the whole state machine) rather than a random sample. `question.id` is
itself the College Board natural key, so the same ids resolve to the same
questions on any instance that scraped the same bank — see the header
comment in `src/exams/index.ts`.

Linked from `/` (a "Practice tests" header button plus a "Practice tests"
section next to "Recent sets") and from `/sets` (a matching header button);
`/tests` links back with "Practice sets" and "Home". **This repo has no
shared nav component** — every page renders its own inline `<header>` —
so a new top-level section is invisible until you add these cross-links by
hand on every page that should surface it. Don't assume a new route is
reachable just because it renders correctly at its own URL.

**Architecture: an exam session IS a `PracticeSet` with `mode: 'exam'`,
plus two small new models** — `ExamSession` (id always equals its
`PracticeSet.id`, mirroring the existing `Attempt.id === PracticeSetItem.id`
convention) and `ExamModule` (one row per section × module-index, tracking
`status`/`variant`/`startPosition`/`itemCount`/`deadlineAt`). This reuses
the entire `PracticeSetItem`/`Attempt`/`AttemptEvent` analytics pipeline
rather than forking it — see the file comment above `ExamSession` in
`contract.prisma` for the full rationale and for how `Attempt.status`
means something different in this mode (a response exists vs. graded and
revealed).

**Section order and "one section at a time" are runtime choices, stored on
`ExamSession`, not properties of the blueprint.** A student picks which
section (`RW` or `MATH`) goes first, and optionally opts into pausing between
sections, in a dialog on `/tests` (`StartExamDialog`); `startExam(examId,
{sectionOrder, splitSitting})` persists both as `ExamSession.sectionOrder`
(a 2-element permutation) and `.splitSitting`. This is why the phase machine
(`src/lib/exam/phases.ts`) is slot-generic — `m1_directions` .. `m4_active` /
`break` / `completed`, not section-named — rather than the `rw_1_*`/`math_1_*`
names an earlier version used: `phaseModule(phase, sectionOrder)` is the one
function that resolves a slot to a section, so `nextPhaseAfterSubmit` and
`activePhaseFor` never need to know which physical section is running.
`modulePositions` (`src/lib/exam/layout.ts`) takes the same `sectionOrder` to
lay out `PracticeSetItem` positions in whichever order was chosen. A
section's own three score fields are written as soon as that section's
second module is submitted (`submitModule`'s `m2_active` branch, calling
`scaleSection` directly rather than waiting for `scoreExam` at full
completion) — this is what lets the break screen show a real scaled score
for the section that just finished, exposed read-side as
`ExamState.sectionScores`, before the other section even exists. The break
screen also gets a plain `Link` back to `/tests` ("Finish for now — I'll do
{next} later") with **no new server action**, since nothing in the phase
machine ever auto-advances past `break` regardless of `splitSitting` — that
flag only changes copy/emphasis, never gates a transition. `/tests`
distinguishes this "1 of 2 sections done" resume state
(`isBetweenSections(phase)`) from a generic in-progress one, and the results
page shows a "taken in two sittings" note only when `splitSitting` was
chosen at start.

**`src/lib/access.ts`'s `getOwnedItem` takes an `ItemAccessPolicy`,
defaulting to `'practice-only'` — this is the single most important
correctness mechanism in the whole feature.** Every existing practice
caller (`getRenderedItem`, `submitAnswer`, `revealAnswer`, `completeSet`,
`POST /api/hint`, `POST /api/coach`) keeps calling it with no policy
argument, which is what closes those routes to exam-mode sets
automatically: `getRenderedItem` and `submitAnswer` reveal the rationale and
correct answer for any answered attempt, so leaving this gate un-defaulted
would leak exam answers mid-test — the same reasoning is why `/api/coach`
additionally refuses to run at all until `Attempt.status === 'answered'`,
even in practice mode (see its file comment).
`toggleEliminateOption`/`toggleMarkForReview`/`saveAnnotations`
pass `'exam-write'` and `recordTime`/`recordToolUsage` pass
`'exam-telemetry'` explicitly, so those five shared functions work for both
modes: the policy is a no-op for `mode: 'practice'` sets and enforces the
active-module + deadline gate for `mode: 'exam'` sets. Never add a new
caller of `getOwnedItem` that skips this default without a specific reason.

**No module timer ever starts automatically — only on an explicit
Continue/Start click**, including the break between the two sections
(whichever order the student chose). Expiry is derived at read time (`isModuleExpired` in
`src/lib/exam/state.ts`), never written as a stored phase or triggered from
inside an RSC render — see `src/lib/exam/phases.ts`'s file comment.
`submitModule` (`src/actions/exams.ts`) is idempotent via a conditional
`WHERE status='active'` update inside its transaction, because the
open-tab countdown reaching zero and a reload landing on the same expired
module **will** race in normal use, not just in theory — an earlier version
of `exam-runner.tsx`'s expiry-guard ref was set in two places and defeated
itself, silently skipping the auto-submit entirely; if you touch that guard,
re-verify with the `sat-smoke` blueprint that a countdown reaching 0 with
the tab open actually calls `submitModule`, not just that the ref looks
correct.

**Exam questions are reserved out of `/new`'s random sampling** — the union
of every registered blueprint's ids (`RESERVED_QUESTION_IDS` in
`src/exams/index.ts`) is excluded via `AND NOT (q.id = ANY(...))` in *both*
`countMatchingQuestions` and `sampleQuestions` (`src/lib/query/generate-set.ts`)
— excluding it from only one would make the builder's live "N questions
match" count lie.

**`scripts/design-exam.ts` is read-only and never writes into `src/`** — it
prints a paste-ready TS id-list literal for a human to review and commit by
hand into a blueprint file. Its `--verify` mode re-checks a committed
blueprint's ids against the live DB (gradability, section match, no shared
`templateClusterId`/`parentTemplateId`, table lengths) and should pass
before and after any manual edit to a blueprint's id lists. It also
excludes every id already claimed by an *other* registered blueprint from
the candidate pool (via `RESERVED_QUESTION_IDS`), but exempts the exam
named by `--exam` from that exclusion — so redesigning `sat-practice-1`
with the same `--seed` reproduces the exact committed ids, while designing
a brand-new exam automatically avoids every id already spoken for.

### How to add a new premade test (e.g. a second SAT test, or a PSAT test)

This is the one workflow in this repo an agent is likely to be asked to
repeat. Follow it in order — each step depends on the last:

1. **Pick an id and name.** `kebab-case`, e.g. `sat-practice-2`. It becomes
   the blueprint's `id` field and the filename `src/exams/<id>.ts`.
2. **Decide the domain/band/SPR targets**, or reuse `sat-practice-1`'s if
   you're not deliberately varying the difficulty/domain mix. These live as
   hand-authored constants at the top of `scripts/design-exam.ts`
   (`RW_MODULE_1`, `MATH_MODULE_2_UPPER`, etc.) — they are *not* a CLI
   parameter, and the script asserts at load time that each design's
   `domainBandTargets` sums to its module's `count`. If you're adding a
   second **SAT** blueprint with the same shape (27/27/22/22, same official
   percentages), you can run the script as-is — it already excludes
   `sat-practice-1`'s ids automatically. If you're designing a **PSAT**
   test or a structurally different SAT test, you'll need to param­eterize
   these constants by exam id first (they're currently written for one
   design at a time) — check `program`/`assessment` in `question_assessment`
   for the PSAT case (`'PSAT/NMSQT & PSAT 10'` / `'P10'`), and re-derive the
   module/timing numbers from the digital PSAT's own published spec, not
   the SAT's — do not assume they're identical.
3. **Run the selection**: `pnpm design:exam --exam=<id> --seed=getgud-<id>`.
   Use a seed that's unique per exam (e.g. `getgud-<id>` as shown) —
   reusing a seed across exams doesn't cause a collision (candidates are
   already excluded), but keeping seeds distinct makes each exam's
   selection order legible on its own. Read the printed
   module × domain × skill × difficulty × type summary and any `SHORT`
   lines by hand — this is the actual design review; the script's defaults
   are a starting point, not an authority (see the file comment at the top
   of `design-exam.ts`).
4. **Author the blueprint file** (`src/exams/<id>.ts`), modeled on
   `sat-practice-1.ts`: paste the printed id lists into
   `module1`/`module2Lower`/`module2Upper` per section, fill `spec` from
   the same domain/band/SPR constants you used in step 2, and derive
   `scaled.lower`/`scaled.upper` raw→scale tables. Don't hand-wave the
   scoring tables — `scoring.ts`'s file comment explains the official
   linear-form table this repo rescales from and how the lower-path cap is
   anchored; follow the same method (or explicitly document a different
   one) rather than guessing round numbers.
5. **Register it** in `src/exams/index.ts`'s `ALL_BLUEPRINTS` array. The
   module-load-time assertions (`validateBlueprint` + cross-blueprint id
   uniqueness) will throw immediately if something's wrong — that's
   intentional, don't work around it by disabling the check.
6. **Verify**: `pnpm design:exam --verify` must pass for every registered
   exam, not just the new one. Then `pnpm build` (type-check) and
   `pnpm lint`.
7. **End-to-end check**: start the dev server and actually run the new
   test (or add a matching `devOnly` smoke variant first, the way
   `sat-smoke.ts` does for `sat-practice-1`, if you want a fast
   timers/routing/expiry check before sitting through the real thing). The
   real signal that the selection is *usable*, not just structurally
   valid, is answering questions and reaching the results page — reading
   the summary table alone doesn't catch a UI-facing issue.
8. **Do not skip the reservation check** — after registering, `/new`'s
   live "N questions match" count should drop by the new blueprint's
   question count (adjusting for ids it shares with the already-excluded
   ungradable pool, which should be none). This confirms
   `RESERVED_QUESTION_IDS` picked up the new exam without you touching
   `generate-set.ts`.

## Problems database (`/problems`)

A third way to reach a question, alongside `/new`'s random sampling and
`/tests`'s premade blueprints: a Bluebook-style browser over the whole
College Board bank — filter/sort by every facet, expand any row to read the
full stimulus/stem/choices, and reveal the correct answer + rationale only
behind an explicit **Show answer** click. A sticky active-set bar lets you
create an empty `PracticeSet` and add hand-picked questions to it as you
browse, then run it through the existing runner.

Same tables, no schema change — a hand-picked set is `PracticeSet` with
`mode: 'practice'` and `config: { kind: "manual" }` (a second non-`SetFilters`
shape in that Jsonb column, alongside `exams.ts`'s `{ examId }`), and
`src/app/problems/page.tsx` finds a profile's own drafts by filtering on
that discriminator client-side (the ORM lane can't query into Jsonb). Query
layer is `src/lib/query/browse-filters.ts` (pure filter type + URL parsing/
serialization — deliberately **not** `server-only`, because the client
filter panel calls `parseBrowseParams`/`browseParamsToQuery` at runtime, not
just for their types) and its sibling `src/lib/query/browse-questions.ts`
(the actual DB queries, `server-only`). New Server Actions live alongside
the existing ones in `src/actions/sets.ts`: `createEmptySet`,
`addQuestionsToSet`, `removeQuestionFromSet`.

**Two filters `/new`'s `generate-set.ts` applies are deliberately NOT
inherited here, by product decision — don't "fix" this back into parity:**
questions reserved for a premade exam (`RESERVED_QUESTION_IDS`) are fully
browsable, revealable, and addable on `/problems`, and a question with no
published answer is shown too (flagged "No answer on file," with both its
Add button and its bulk-select checkbox disabled — `addQuestionsToSet`
rejects a whole batch containing one). `/new` keeps both filters unchanged;
`browse-questions.ts` has its own copy of the WHERE clause rather than
sharing `generate-set.ts`'s `buildWhereFragment`, specifically so a future
edit to one can't silently change the other.

**Every hand-picked item append is append-only — never inserted
mid-sequence.** `addQuestionsToSet` writes new `PracticeSetItem` rows at
`maxPosition + 1 + i`; existing `Attempt` rows key off item id and
`@@unique([setId, position])` would collide with anything else.
`removeQuestionFromSet` (only permitted while the set has zero answered
attempts) deletes one row, then renumbers the survivors to `0..n-1` in
**ascending** position order specifically — every position only ever
decreases, so each target slot was already vacated by the deletion or a
prior loop iteration, and the unique constraint never trips mid-renumber.

**`question_assessment`'s PK is `(assessment, questionId)`** — same reason
`generate-set.ts` pins a single assessment per query — so `browseQuestions`
forces the filter panel's assessment to match whatever set is active
(`?set=<id>`) rather than letting them drift independently; otherwise an
added item could snapshot a different assessment's difficulty than the one
the browser was showing.

Sorting is a **param-driven `CASE`, not an interpolated `ORDER BY <column>`**
— `db.raw.sql`'s `${}` is always a bind parameter, never an identifier. The
default "skill" sort prefixes by `qa.section` before `domainCode`/
`skillCode`, because domain codes alone sort alphabetically (CAS, EOI, H,
INI, P, Q, S…), which interleaves Reading/Writing and Math domains.

An empty hand-picked draft (`questionCount: 0`) has no items, so
`/sets/[id]`'s `Math.min(currentIndex, questionCount - 1)` would be `-1` —
that page redirects a zero-item set straight back to `/problems?set=<id>`
rather than rendering a broken runner; `/sets`' library list shows the same
draft with a "Draft" badge linking there instead of into the runner.

## Similar problems (embeddings)

A fourth way to reach a question, layered onto `/problems` rather than a new
page: **"View similar problems"** opens `/problems?similar=<questionId>` —
the existing browser, re-ranked by embedding cosine similarity to that
question, with every filter, the answer reveal, the active-set bar, and "Add
to set" working unchanged. Entry points: an expanded row's footer on
`/problems` (`problem-row.tsx`), the post-answer feedback card in the
practice runner (`practice-runner.tsx` — **post-answer and practice-mode
only**, never in `exam-runner.tsx`, which is a fully separate component and
carries no similar-search code at all — a near-duplicate's rationale would
spoil the answer if this appeared pre-submit), and a "Practice similar" link
per row on `/sets/[id]/results`.

**Model/text choice is empirically justified by a sibling project, not
guessed.** `../../other/or-emb` (not a runtime dependency — a separate
checkout) swept 33 OpenRouter embedding models × 3 text variants against
this exact 3,767-question bank and found `google/gemini-embedding-2` on the
`full` variant (stimulus + stem + answer options concatenated) wins on every
axis (domain/skill/style separation). See its README for the full
methodology. **Its cached vectors are deliberately not imported**, though:
it embeds text extracted from the *raw* scraped HTML via its own extractor
(math renders as College Board's spoken-form alt text), which differs from
this app's own canonical Postgres columns (`pnpm convert:math` already
resolved saic equations to real LaTeX) — the two would occupy different
vector spaces and can't be mixed. `pnpm embed` (`scripts/embed-questions.ts`)
embeds fresh from `Question.{stimulus,stem,answerOptions}` instead — a fifth,
optional pipeline stage (see `scripts/README.md`), reading Postgres rather
than `data/`, requiring `OPENROUTER_API_KEY`, costing about $0.15–0.20 for
the whole bank, and resumable the same way `pnpm scrape` is (skips any
question whose stored embedding's `contentHash` still matches).

**Storage: `Bytes` (bytea), not pgvector.** `QuestionEmbedding` (contract.prisma)
stores each vector as raw little-endian float32 bytes, L2-normalized on
write so cosine similarity is a plain dot product at query time — never
assume a provider already returns unit vectors (verified: most do, some
don't, e.g. `perplexity/pplx-embed-v1-4b` returns norms ~9.7–16.6 in
or-emb's benchmark). pgvector was deliberately skipped: this machine's
Postgres has no `vector` extension available (`pg_available_extensions`),
adding it would mean a new brew/apt step in the from-scratch README for
every self-hoster, and at 3072 dims it would exceed pgvector's HNSW/IVFFlat
index dimension cap anyway (exact-scan territory either way at this
corpus's size). Keyed by `(questionId, model, textVariant)` rather than
`questionId` alone, so switching embedding models later is additive — old
and new vectors can coexist — not a wipe-and-redo.

**Retrieval is a brute-force in-process index, not a DB-side ANN query.**
`src/lib/embeddings/core.ts` is pure (no `server-only`, no `@/prisma/db`
import) and holds the text builder, the OpenRouter embedding-model
constructor, and `EmbeddingIndex` — a flat `Float32Array` (all ~3,767 rows ×
3072 dims ≈ 46MB) plus a cosine top-K scan. `src/lib/query/similar-questions.ts`
is the `server-only` I/O wrapper: it loads `QuestionEmbedding` rows via the
ORM (not `db.raw.sql` — `Bytes` decodes natively through the ORM lane, same
reason `browseQuestions` reads content columns through the ORM after its
raw-SQL facet query) and caches the built index on `globalThis`, for the
same Turbopack-per-entrypoint-bundle reason `db.ts` caches `db`/`param` (see
"Practice-tool app layer" above) — **unconditionally**, not gated on
`NODE_ENV`, since that guard exists in `db.ts` to survive Fast Refresh, and
copying it here would reload 46MB per request under `next start`. An empty
index is deliberately never cached, so a dev server already running when
`pnpm embed` populates the table for the first time picks the rows up on
its own on the next request — no restart needed. A restart **is** needed
after re-running `pnpm embed` against a database that already had rows,
since the cached index doesn't know to invalidate itself.

**Why `core.ts` must never import from `hint-provider.ts`.** `hint-provider.ts`
starts with `import "server-only"`, whose package resolves the plain
`"default"` export condition (i.e., anything that isn't Next's
`react-server` bundler condition — which includes `tsx`) to a module that
unconditionally throws. `scripts/embed-questions.ts` runs under plain `tsx`,
so importing anything that transitively pulls in `server-only` crashes on
load. `core.ts` builds its own `createOpenRouter({ apiKey })` rather than
reusing `hint-provider.ts`'s.

**`(sectionCode, assessment)` are pinned into every "View similar" href as
plain, user-adjustable filter chips**, not hidden query state — landing on
`/problems?similar=<id>&assessment=<A>&sections=<S>` sets those two filters
to the source question's own section/assessment but leaves domain/skill/
difficulty/etc. at "all," so a student can loosen or tighten from there like
any other browse session. `sort` defaults to a new `"similarity"` value
(ranked by `array_position` into the id list `rankSimilar()` returns) when
`?similar=` is present and no explicit `sort` was given, and
`parseBrowseParams` coerces `sort=similarity` back to `"skill"` whenever
`similarTo` is empty — otherwise `array_position` against an empty array
returns NULL for every row and the sort would silently degrade to the
`q.id` tiebreaker.

**Near-duplicate (same-template) questions are shown, not filtered, and
labeled.** College Board's own `templateClusterId`/`parentTemplateId`
grouping (same fields `scripts/design-exam.ts` treats as duplicates) will
put a question's own re-skinned siblings at the very top of its similarity
ranking, by construction — that's genuinely useful drilling, so
`problem-row.tsx` shows a "Same template" badge instead of hiding them.
Similarity is surfaced as a **rank** ("#3 most similar"), never a raw cosine
percentage — Gemini-embedding cosine values cluster in the ~0.6–0.9 band
regardless of how similar two questions actually are, so a raw score reads
as noise.

**Reserved/ungradable questions inherit `/problems`' own policy, not
`/new`'s** — a similar-mode result set is still `browseQuestions` under the
hood, so exam-reserved and no-published-answer questions remain browsable
here exactly as they are in plain browse mode; see "Problems database"
above.

## Learn section (resources + guides)

The site is split into two halves: **Practice** (`/new`, `/sets`, `/tests`
— everything above) and **Learn** (`/learn`), a curated study library.
`/` is the shared entry point and presents both.

**The shelf is committed code, not database rows** (`src/resources/`) —
same decision, same reasoning, as `src/exams/`: it's identical on every
self-hosted copy, it needs no contract change or migration to edit, it's
reviewable in a diff, and critically **it renders on a fresh clone before
`pnpm scrape` has ever run.** That last point is why `/learn` requires
neither a profile nor a database: until the pipeline completes the entire
Practice half is empty, and a new user needs somewhere to go.

Layout mirrors `src/exams/` deliberately:
- `src/resources/spec.ts` — types + pure validation, dependency-free.
- `src/resources/index.ts` — the registry, with load-time assertions.
- `official.ts` / `courses.ts` / `channels.ts` / `library.ts` — external links.
- `src/resources/guides/*.ts` — original in-app content (cheat sheets,
  strategy, study plans), authored here rather than linked.

**Every external URL is verified by fetching it, and carries a
`verifiedAt` date.** Four plausible-looking College Board paths and one
guessed YouTube `@handle` turned out to be 404s during the initial
curation pass — a remembered URL shape is not evidence. When adding a
resource, fetch it first. Link rot is the main way this shelf decays, so
the date is there to tell a future maintainer how stale a check is.

**Resources and guides are tagged with the same `domainCode`/`skillCode`
taxonomy as questions** (`src/lib/catalog.ts`), which is what lets the
practice results page link a missed skill straight to its study material
(`studyForSkill` in the registry, ordered most-specific-first). Those codes
are validated against the catalog at module load, because a typo'd skill
code doesn't throw — it silently never matches, so a student's weakest
skill would quietly show no resources. Same class of silent failure the
exam registry's assertions exist to catch. The registry also rejects
duplicate ids, duplicate URLs, and a `related` id pointing at a resource
that no longer exists.

**Two React Server Component hazards this section hit, both worth knowing
before editing it:**

1. `ResourceCard`/`GuideCard` are `"use client"` **on purpose.** They're
   rendered from server pages *and* from the client-filtered directory, and
   `@phosphor-icons/react`'s bare import crashes a Server Component build
   (see the icon note above). Importing from `/dist/ssr` instead would
   break the moment the client directory imports the same file. Marking the
   leaf as a client component is the only option correct from both sides.
2. **Constants can't live in those client files.** Next turns *every*
   export of a `"use client"` module into a client reference, so a Server
   Component reading a plain constant from one throws at runtime rather
   than rendering. The label maps therefore live in
   `src/components/learn/labels.ts`, a plain module with no `"use client"`,
   imported by both sides.

Everything a client component imports from `@/resources` is a **type-only**
import, which keeps the registry (and its load-time validation) out of the
client bundle. `/learn/resources` gets the data as a serialized prop
instead. If you add a value import there, the whole shelf ships to the
browser.

`SiteNav` (`src/components/site-nav.tsx`) is the shared nav that makes the
two halves navigable, and it replaced the hand-written cross-links each
page used to carry — adding a route to its `SECTIONS` map now surfaces it
everywhere at once, rather than needing a link added to every page by hand.
It is deliberately **not** rendered by the runners (`/sets/[id]`,
`/tests/[sessionId]`): those are focused test-taking surfaces, and in exam
mode the UI must not offer navigation out of a timed module.

## Statistics & AI analysis

`/stats` aggregates a profile's **entire** history — every `PracticeSet` and
`ExamSession`, not just one set — into charts, rule-based insights, and an
on-demand AI analysis. No schema changes: everything is computed on read
from the existing `Attempt`/`PracticeSet`/`ExamSession` rows, which already
carry the denormalized facet snapshot the contract's own comment says exists
"so a future stats screen groups by skill with zero joins."

**Layout, mirroring the `src/exams/`/`src/resources/` split between pure
computation and I/O:**
- `src/lib/stats/aggregate.ts` — pure, dependency-free functions (no
  `@/prisma/db` import) that turn already-fetched rows into every chart's
  dataset (`bySkill`, `byDomain`, `byDifficulty`, `byTimeOfDay`,
  `calculatorUsage`, `markForReviewImpact`, `accuracyTrendDelta`, etc.) plus
  `buildStatsBundle()`, the single entry point. `Attempt` carries no `mode`
  column, so practice-vs-exam is resolved via a `setId -> PracticeSet.mode`
  map built once inside `buildStatsBundle`.
- `src/lib/stats/insights.ts` — `computeInsights()` turns the aggregates into
  the handful of plain-English sentences shown as `Alert`s. Every rule has an
  explicit minimum-sample-size guard (see the numbers inline) so a skill with
  one graded question never drives a claim.
- `src/lib/stats/load.ts` / `chat-history.ts` / `question-details.ts` — the
  I/O half: `loadStatsBundle(profileId)` runs the three
  `Attempt`/`PracticeSet`/`ExamSession` queries and calls `buildStatsBundle`;
  `loadChatExcerpts(profileId)` separately pulls the 8 most recent non-empty
  `Attempt.chatMessages` conversations (truncated per-conversation);
  `loadQuestionDetails(profileId)` separately pulls the 25 most recent wrong
  attempts plus 12 most recent correct ones, joined by hand to their
  `Question` row (this ORM has no relation `.include()` used anywhere else
  in the app, so this follows the existing two-query-and-join-in-JS pattern
  from `access.ts`/`attempts.ts` rather than introducing a new one) and
  truncated per-field (stimulus to 900 chars — the bank's 90th-percentile
  stimulus length, chosen so the truncation only bites the rare
  multi-thousand-char outlier rather than cutting off a typical passage
  before any genre/era signal appears; stem to 400; each choice to 200; the
  official rationale, wrong answers only, to 300) — real question content
  for the AI to read directly, not just facet codes, so it can notice a
  content-level pattern (a passage genre/era/style like "pre-20th-century
  literary prose," a recurring trap-answer type, a math problem structure)
  that an accuracy-by-skill-code breakdown can't show, since the SAT's own
  skill/domain taxonomy has no code for any of that. Only `analyzeStats()`
  reads this one (unlike the other two, `/stats`'s own page never needs raw
  question text). All three are called by `src/app/stats/page.tsx` and/or
  `src/actions/stats.ts` rather than
  querying directly, so the page and the AI prompt never drift out of sync
  on what "the stats" are.
- `src/lib/ai/stats-prompt.ts` / `stats-schema.ts` / `src/actions/stats.ts` —
  the AI half, mirroring `coach-prompt.ts`'s shape (pure prompt builder in,
  `generateObject` call in the action). `analyzeStats()` is a Server Action,
  not a route handler, because `generateObject` is a single non-streaming
  call — a plain action already returns exactly that.

**Practice-mode and exam-mode stats are never blended** — a practice-set
accuracy percentage and an exam's scaled section score (200–800) measure
different things, so they get separate tabs (`stats-client.tsx`'s
`Tabs`) and separate insight IDs (`exam-trend` is the one exam-specific
insight; everything else is practice-only). The one exception is the
headline KPI row, which only shows numbers that don't depend on
practice-only tool-usage columns exams don't have.

**Recommended sets reuse `createSet` (`src/actions/sets.ts`) completely
unmodified** — `RawSetFilters` already supports `domainCodes`/`skillCodes`
as first-class arrays, so an AI recommendation is just a `RawSetFilters`
object with `skillCodes` set and `sectionCodes`/`domainCodes` left as `[]`
(which `validateSetFilters` expands from the skill's own domain). No new
set-creation code path was needed for "AI creates a set you can start."

**Structured AI output: every schema field must be in `required`, so never
use zod `.default()` or `.optional()` on `AnalysisSchema`
(`src/lib/ai/stats-schema.ts`).** Some models routed through OpenRouter run
behind a strict JSON-schema backend (observed with an Azure-hosted model)
that rejects a schema where a property is missing from its object's
`required` array — which is exactly what a zod `.default(...)` produces.
This surfaced as a runtime failure only when the "Analyze my performance"
button was actually clicked: `[Azure] Invalid schema for response_format
'response': ... 'required' is required to be supplied and to be an array
including every key in properties. Missing 'difficulties'.` The fix is
structural, not a try/catch: model every field as a plain required value,
using an empty array (never an omitted key) as the "not applicable" case —
see `troubleSpots`/`difficulties`'s comments in `stats-schema.ts`.

**Recharts bars/lines needed `isAnimationActive={false}` on every `<Bar>`/
`<Line>`.** Without it, the very first mount after a Turbopack dev-mode
recompile reliably left every bar chart's `<g class="recharts-bar-rectangles">`
completely empty (zero child elements, no console error, just a blank card)
— confirmed by inspecting the raw SVG, not just a visual glance. A reload
fixed it every time, consistent with an animation/StrictMode timing race
rather than a data or config bug. Disabling per-shape animation sidesteps it
entirely and costs nothing for a stats dashboard (instant, static charts are
the right UX here anyway, not a grow-in animation). If you add a new chart,
copy this from `rate-bar-chart.tsx`/`difficulty-bar-chart.tsx`/
`accuracy-trend-chart.tsx`/`exam-score-chart.tsx` rather than rediscovering
it — and when debugging *any* "chart renders blank, no error" report here,
rule out a stale `next start`/`next dev` process still bound to the port
serving mismatched build output before assuming it's a code regression
(that cost real debugging time once already: an old server process left
running after a rebuild served a page that referenced the new chunk hashes
against the old server's in-memory module graph).

**A bar chart's width *is* its value, so an exact 0% bar is invisible by
construction** — every `<Bar>` also sets `minPointSize={2}` so a
0%-accuracy category still shows a visible sliver instead of looking
indistinguishable from "no data for this category at all."

`SiteNav`'s `Half` type (`src/components/site-nav.tsx`) is `"learn" |
"practice" | "stats"` — `/stats` is its own top-level header pill (not
nested under Practice), with a single-item `links` sub-row ("Overview") for
consistency with how `Learn`'s pill also carries an "Overview" sub-link.

**Pacing analysis — "correct but slow" and "wrong but rushed" — is a
separate signal from plain accuracy or the student's own manual
mark-for-review flag, and it is the one part of `/stats` deliberately
computed across *both* practice sets and practice tests**, added in
`aggregate.ts`'s `pacingEligible` / `computePacingBaseline` /
`slowCorrectQuestions` / `pacingBySkill` / `pacingByDomain`, and exposed as
its own top-level `StatsBundle.pacing: PacingStats | null` — a sibling of
`practice`/`exam`, not nested inside either. "Slow" is always relative to
the student's *own* median time on their other eligible correct answers,
bucketed by `sectionCode:difficulty` (RW vs Math and easy vs hard questions
have very different normal paces) — never a fixed number of seconds. A
bucket needs `>=5` samples to be trusted (`PACING_MIN_BASELINE_SAMPLES`);
thinner buckets fall back to a section-wide median, then an overall median
(itself only trusted past that same sample floor, never computed from a
couple of data points).

**Why this crosses the practice/exam boundary when nothing else in this
file does.** "Practice-mode and exam-mode stats are never blended" (below)
is about not averaging two *different units* — a practice accuracy
percentage and a 200–800 scaled score. Pacing isn't either of those: it's a
per-question fact (`isCorrect`, `markedForReview`, time-on-question) that
means exactly the same thing regardless of which mode produced it, so
computing it over `input.attempts` unfiltered by mode is a strictly more
complete answer to "which past questions are worth another look," not an
apples-to-oranges blend. This is also why `pacingEligible`'s hint/reveal
exclusions need no exam-specific carve-out: exam-mode sets close
`/api/hint` and `/api/coach` via `getOwnedItem`'s default `'practice-only'`
policy (see "Premade exams" below), so an exam attempt already has
`hintsUsed === 0` and `answerRevealed === false` by construction — it
satisfies `pacingEligible` the same way an unaided practice attempt does,
with no special-casing needed. `pacing.markForReview` (a combined version
of the existing `markForReviewImpact`) lives here for the same reason;
`PracticeStats.markForReview` still exists separately, scoped to practice
sets only, feeding the Practice tab's own tile.

**Uses `Attempt.totalMs`, not `activeMs`, and this is load-bearing, not a
style choice.** `activeMs` keeps accumulating after the question is
answered — it's only paused on tab-hidden/blur, never on submit (see
`practice-runner.tsx`'s `activeTrackerRef`, untouched by `handleSubmit`) —
so it silently absorbs the time spent reading the rationale and chatting
with Strobi afterward, which this app actively encourages as a core
feature. A question a student nailed instantly but then discussed with the
coach for three minutes would misreport as "slow." `totalMs`, by contrast,
is exactly the value `live-timer.tsx` freezes at the instant of submission
(`now - firstViewedAt`, recomputed server-side in `submitAnswer`) — it
never includes anything that happens after. The tradeoff is that `totalMs`
is wall-clock, not focus-time, so a backgrounded/left-open tab can put a
single attempt at tens of minutes with nothing to do with actual struggle;
`pacingEligible` drops any attempt over `PACING_CEILING_MS` (10 minutes)
from both the baseline and eligibility for flagging, rather than letting
one outlier dominate the "worst offenders" list or skew a bucket's median.
`pacingEligible` also excludes hinted attempts (`hintsUsed > 0`) entirely —
hint time isn't the student's own unaided pace, and hint usage already has
its own dedicated `hintImpact`/hint-impact-insight treatment — and excludes
revealed answers (giving up isn't a pacing failure).

A correct answer counts as "slow" only past both a relative floor (`>=1.6x`
its baseline, `SLOW_CORRECT_RATIO`) and an absolute one (`>=60s`,
`SLOW_CORRECT_FLOOR_MS`) — the absolute floor exists because a 10s baseline
makes even a 16s answer technically "1.6x," which isn't what anyone means
by "took a long time." A wrong answer counts as "rushed" at `<=0.5x`
baseline (`RUSHED_WRONG_RATIO`).

This feeds four places, and all four must stay in sync if the thresholds
or eligibility rules change: the `pacing-risk`/`rushed-mistakes`/combined
`mark-for-review` insights in `insights.ts` — computed in their own
`if (pacing)` block ahead of the practice-only rules specifically so
`pacingConcern` is in scope for the existing `slow-skill` rule to skip
whatever skill `pacing-risk` already flagged (the two would otherwise say
almost the same thing about the same skill), each with its own
skill-level sample-size guard like every other rule there; `stats-client.tsx`'s
mode-agnostic "Pacing" section (rendered above the Practice/Practice Tests
tabs, not inside either one) holding the combined mark-for-review tile, the
"Slow-but-correct rate by domain" chart, and `SlowCorrectTable`'s
per-question list (each row links to `/sets/[id]/results`, which redirects
to `/tests/[id]/results` on its own when the row's origin was a practice
test — see the "Premade exams" section — so the link never needs to branch
on mode; that page has no per-item anchor to jump straight to one question
either, so the row shows mode/skill/difficulty/date to narrow it down
instead); and `pacingConcerns`/`rushedMistakes`/the now-combined
`markForReview` in `stats-prompt.ts`'s `StatsSummaryInput` (populated in
`src/actions/stats.ts` from `bundle.pacing`, filtered to non-zero counts so
the prompt isn't padded with skills showing no pattern) so the AI analysis
can recommend a timed-drilling set for a skill that's accurate but slow,
not just an inaccurate one.

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
