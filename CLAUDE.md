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
`/api/coach` streaming, `/api/events` telemetry ingest); and a second, formal
practice mode —
premade, full-length, timed, adaptive SAT practice tests (`/tests`,
`/tests/[sessionId]`, `/tests/[sessionId]/results`) that are identical on
every self-hosted instance. See "Practice-tool app layer" below for the
data model and load-bearing gotchas, and "Premade exams" for the exam
system specifically.

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
Continue/Start click**, including the break between Reading & Writing and
Math. Expiry is derived at read time (`isModuleExpired` in
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
