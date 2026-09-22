import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/prisma/db";
import { getCurrentProfile } from "@/lib/profile";
import { domainLabel, isValidAssessment, skillLabel } from "@/lib/catalog";
import { BROWSE_PAGE_SIZE, browseParamsToQuery, parseBrowseParams } from "@/lib/query/browse-filters";
import { browseQuestions, countBrowseQuestions, type BrowseRow, type SimilarContext } from "@/lib/query/browse-questions";
import { SIMILAR_POOL_SIZE, rankSimilar, similarSearchAvailable } from "@/lib/query/similar-questions";
import { renderContentField } from "@/lib/content/render";
import { hintsConfigured } from "@/lib/ai/hint-provider";
import type { AnswerOption } from "@/lib/grading";
import { SiteNav } from "@/components/site-nav";
import { ProblemFilters } from "@/components/problems/problem-filters";
import { ProblemsBrowser } from "@/components/problems/problems-browser";
import { ResultsToolbar } from "@/components/problems/results-toolbar";
import { PaginationBar } from "@/components/problems/pagination-bar";
import { SmartSearchPanel } from "@/components/problems/smart-search-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
import type { ActiveSet, DraftSetOption, ProblemRowData } from "@/components/problems/types";

/**
 * `?set=<id>` — ownership re-derived here every render, never trusted from
 * the URL (src/lib/profile.ts's requireProfileId doc comment). Only a
 * `mode: "practice"`, `status: "in_progress"` set the profile owns can be
 * the active set; anything else (a foreign id, an exam set, a completed
 * one) silently falls back to "no active set" rather than erroring — a
 * stale bookmark or a shared link shouldn't crash the page.
 */
async function loadActiveSet(setId: string, profileId: string): Promise<ActiveSet | null> {
  const set = await db.orm.public.PracticeSet.first({ id: setId, profileId });
  if (!set) return null;
  if (set.mode !== "practice" || set.status !== "in_progress") return null;
  if (!isValidAssessment(set.assessment)) return null;

  const items = await db.orm.public.PracticeSetItem.where({ setId }).orderBy((i) => i.position.asc()).all();
  return {
    id: set.id,
    name: set.name,
    assessment: set.assessment,
    questionCount: set.questionCount,
    items: items.map((i) => ({
      questionId: i.questionId,
      sectionCode: i.sectionCode,
      domainLabel: domainLabel(i.domainCode),
      skillLabel: skillLabel(i.skillCode),
      difficulty: i.difficulty,
    })),
  };
}

/**
 * Hand-picked drafts for the active-set bar's "resume a draft" picker.
 * `config` is Jsonb — the ORM lane can't filter on `config->>'kind'`, so
 * this filters in JS over the same `limit(100)` bound src/app/sets/page.tsx
 * already uses for its own listing.
 */
async function loadDraftSets(profileId: string): Promise<DraftSetOption[]> {
  const sets = await db.orm.public.PracticeSet
    .where({ profileId, mode: "practice", status: "in_progress" })
    .orderBy((s) => s.createdAt.desc())
    .limit(100)
    .all();

  const drafts: DraftSetOption[] = [];
  for (const s of sets) {
    const config = s.config as { kind?: string } | null;
    if (config?.kind !== "manual") continue;
    if (!isValidAssessment(s.assessment)) continue;
    drafts.push({ id: s.id, name: s.name, questionCount: s.questionCount, assessment: s.assessment });
  }
  return drafts;
}

/** The source question shown in the banner above results when ?similar=<id> is set. */
interface SimilarSource {
  questionId: string;
  stemHtml: string;
  sectionCode: string | null;
  domainLabelText: string | null;
  skillLabelText: string | null;
  difficulty: string | null;
  /** Non-null templateClusterId/parentTemplateId, for flagging "same template" neighbours below. */
  templateKeys: Set<string>;
}

/**
 * The source question's own placement is looked up under `assessment`
 * specifically — the same question can carry different facets on SAT vs.
 * PSAT (QuestionAssessment's whole reason for being a separate table), and
 * `filters.assessment` is what every other query on this page is already
 * scoped to. A question with no placement under this assessment (or no
 * placement at all) still renders — just without facet badges.
 */
async function loadSimilarSource(questionId: string, assessment: string): Promise<SimilarSource | null> {
  const question = await db.orm.public.Question.first({ id: questionId });
  if (!question) return null;
  const placement = await db.orm.public.QuestionAssessment.first({ assessment, questionId });

  const templateKeys = new Set<string>();
  if (question.templateClusterId) templateKeys.add(question.templateClusterId);
  if (question.parentTemplateId) templateKeys.add(question.parentTemplateId);

  return {
    questionId: question.id,
    stemHtml: renderContentField({ html: question.stem, contentHash: question.contentHash, field: "stem" }),
    sectionCode: placement?.sectionCode ?? null,
    domainLabelText: placement ? domainLabel(placement.domainCode) : null,
    skillLabelText: placement ? skillLabel(placement.skillCode) : null,
    difficulty: placement?.difficulty ?? null,
    templateKeys,
  };
}

/** Every row's own "View similar" destination — a fresh navigation, not filtered through the current query string. */
function buildSimilarHref(row: { questionId: string; sectionCode: string }, assessment: string, activeSetId: string | null): string {
  const qs = new URLSearchParams({ similar: row.questionId, assessment, sections: row.sectionCode });
  const href = `/problems?${qs.toString()}`;
  return activeSetId ? `${href}&set=${encodeURIComponent(activeSetId)}` : href;
}

interface RenderRowContext {
  assessment: string;
  activeSetId: string | null;
  /** questionId -> 1-based rank, present only in similar-mode. Rank, not raw cosine score — see problem-row.tsx's badge. */
  similarRankOf: ReadonlyMap<string, number> | null;
  /** The similar-mode source's own templateClusterId/parentTemplateId, for the "Same template" badge. Null outside similar-mode. */
  sourceTemplateKeys: ReadonlySet<string> | null;
}

/** BrowseRow -> fully rendered row, same shape/approach as /tests/[sessionId]/results building ExamReviewRow. */
function renderBrowseRow(row: BrowseRow, ctx: RenderRowContext): ProblemRowData {
  const options =
    (row.answerOptions as AnswerOption[] | null)?.map((o) => ({
      id: o.id,
      letter: o.letter,
      html: renderContentField({ html: o.content, contentHash: row.contentHash, field: `option:${o.id}` }),
    })) ?? null;
  const correctOption = options?.find((o) => row.correctKeys.includes(o.id)) ?? null;

  const sameTemplate =
    ctx.sourceTemplateKeys !== null &&
    ((row.templateClusterId !== null && ctx.sourceTemplateKeys.has(row.templateClusterId)) ||
      (row.parentTemplateId !== null && ctx.sourceTemplateKeys.has(row.parentTemplateId)));

  return {
    questionId: row.questionId,
    externalId: row.externalId,
    ibn: row.ibn,
    type: row.type as "mcq" | "spr",
    contentSource: row.contentSource,
    hasEmbeddedMathImages: row.hasEmbeddedMathImages,
    sectionCode: row.sectionCode as "RW" | "MATH",
    domainLabel: domainLabel(row.domainCode),
    skillLabel: skillLabel(row.skillCode),
    difficulty: row.difficulty as "E" | "M" | "H",
    scoreBand: row.scoreBand,
    gradable: row.gradable,
    answeredCount: row.answeredCount,
    correctCount: row.correctCount,
    stimulusHtml: row.stimulus
      ? renderContentField({ html: row.stimulus, contentHash: row.contentHash, field: "stimulus" })
      : null,
    stemHtml: renderContentField({ html: row.stem, contentHash: row.contentHash, field: "stem" }),
    rationaleHtml: renderContentField({ html: row.rationale, contentHash: row.contentHash, field: "rationale" }),
    options,
    correctOptionId: correctOption?.id ?? null,
    correctAnswer: row.correctAnswer,
    similarityRank: ctx.similarRankOf?.get(row.questionId) ?? null,
    sameTemplate,
    similarHref: buildSimilarHref(row, ctx.assessment, ctx.activeSetId),
  };
}

export default async function ProblemsPage({ searchParams }: PageProps<"/problems">) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/");

  const sp = await searchParams;
  let filters = parseBrowseParams(sp);

  const activeSetIdParam = sp.set;
  const activeSetId = typeof activeSetIdParam === "string" ? activeSetIdParam : undefined;
  const activeSet = activeSetId ? await loadActiveSet(activeSetId, profile.id) : null;

  // Assessment is forced to match the active set — an item snapshotting a
  // different assessment's facets than the set it lands in would corrupt
  // /stats. See browse-filters.ts's parseBrowseParams doc comment.
  if (activeSet && filters.assessment !== activeSet.assessment) {
    filters = { ...filters, assessment: activeSet.assessment };
  }

  // Computed once and reused below — similarSearchAvailable() is cheap
  // after the first call (its index is cached on globalThis), but there's
  // no reason to call it twice in one render.
  const embeddingsAvailable = await similarSearchAvailable();

  // Same gating precedent as /new's Smart select and "View similar
  // problems" — hidden entirely rather than shown-and-erroring when
  // OPENROUTER_API_KEY isn't set or `pnpm embed` hasn't populated the
  // embedding table yet.
  const smartAvailable = hintsConfigured() && embeddingsAvailable;

  // Resolve similar-mode up front: the source question + its ranked
  // neighbours. Three distinct "nothing to show" states get their own copy
  // in the banner below, rather than one generic empty result —
  // similarUnavailable (no instance-wide embeddings at all, i.e. `pnpm embed`
  // was never run) vs. a bad/foreign id (source is null) vs. a real question
  // that simply hasn't been embedded yet (source resolves, hits is empty).
  let similarSource: SimilarSource | null = null;
  let similarContext: SimilarContext | null = null;
  let similarUnavailable = false;
  if (filters.similarTo) {
    if (!embeddingsAvailable) {
      similarUnavailable = true;
    } else {
      const [source, hits] = await Promise.all([
        loadSimilarSource(filters.similarTo, filters.assessment),
        rankSimilar(filters.similarTo, SIMILAR_POOL_SIZE),
      ]);
      similarSource = source;
      if (hits.length > 0) {
        similarContext = { ids: hits.map((h) => h.id), scores: new Map(hits.map((h) => [h.id, h.score])) };
      }
    }
  }

  // Renders every row's content server-side, eagerly, exactly as
  // /tests/[sessionId]/results does for a full-length test — cheap at
  // BROWSE_PAGE_SIZE rows/page thanks to renderContentField's LRU cache.
  const [rows, total, draftSets] = await Promise.all([
    browseQuestions(filters, profile.id, similarContext),
    countBrowseQuestions(filters, profile.id, similarContext),
    loadDraftSets(profile.id),
  ]);

  const similarRankOf = similarContext ? new Map(similarContext.ids.map((id, i) => [id, i + 1])) : null;
  const renderedRows = rows.map((row) =>
    renderBrowseRow(row, {
      assessment: filters.assessment,
      activeSetId: activeSet?.id ?? null,
      similarRankOf,
      sourceTemplateKeys: similarSource?.templateKeys ?? null,
    }),
  );
  const totalPages = Math.max(1, Math.ceil(total / BROWSE_PAGE_SIZE));
  const filtersQuery = browseParamsToQuery(filters);
  // Shared by both the "Similar to" and "Opened question" banners' Clear
  // buttons — neither carries any other filter state worth preserving, so
  // both just drop back to a plain (or active-set-scoped) browse view.
  const clearContextHref = activeSet ? `/problems?set=${encodeURIComponent(activeSet.id)}` : "/problems";

  return (
    <>
      <SiteNav />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-16">
        <header className="flex flex-col gap-1">
          <span className="text-xs tracking-[0.05em] text-muted-foreground uppercase">Question bank</span>
          <h1 className="text-4xl font-medium tracking-tight">Browse every problem</h1>
        </header>

        {filters.focusId && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">
              {rows.length > 0 ? "Showing the one question you opened." : "That question could not be found."}
            </p>
            <Button variant="ghost" size="sm" render={<Link href={clearContextHref} />} nativeButton={false}>
              <XIcon data-icon="inline-start" />
              Show all questions
            </Button>
          </div>
        )}

        {filters.similarTo && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs tracking-[0.05em] text-muted-foreground uppercase">Similar to</span>
              <Button variant="ghost" size="sm" render={<Link href={clearContextHref} />} nativeButton={false}>
                <XIcon data-icon="inline-start" />
                Clear
              </Button>
            </div>
            {similarUnavailable ? (
              <p className="text-sm text-muted-foreground">
                Similar-question search isn&apos;t set up on this instance yet — run <code>pnpm embed</code> to enable it.
              </p>
            ) : !similarSource ? (
              <p className="text-sm text-muted-foreground">That question could not be found.</p>
            ) : !similarContext ? (
              <p className="text-sm text-muted-foreground">
                This question hasn&apos;t been indexed for similarity search yet — run <code>pnpm embed</code> to include it.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {similarSource.sectionCode && <Badge variant="secondary">{similarSource.sectionCode}</Badge>}
                  {similarSource.difficulty && <Badge variant="outline">{similarSource.difficulty}</Badge>}
                  {similarSource.domainLabelText && similarSource.skillLabelText && (
                    <span className="text-muted-foreground">
                      {similarSource.domainLabelText} — {similarSource.skillLabelText}
                    </span>
                  )}
                </div>
                <div
                  className="text-sm leading-relaxed [&_.katex]:text-[1.05em]"
                  dangerouslySetInnerHTML={{ __html: similarSource.stemHtml }}
                />
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
          <ProblemFilters filters={filters} pinnedAssessment={activeSet?.assessment ?? null} />

          {/*
            min-w-0: a CSS Grid item's default min-width is "auto" — the
            same overflow trap flexbox has, just one layer up. Without it,
            Smart search's long, single-line (truncate = white-space:nowrap)
            preview text pushes this whole 1fr track wider than the grid
            actually allocated it, which then pushes the whole page into
            horizontal scroll. Confirmed via computed styles: the grid
            container was correctly 976px wide, but this child measured
            1291px until this was added.
          */}
          <div className="flex min-w-0 flex-col gap-4">
            {smartAvailable && <SmartSearchPanel filters={filters} activeSet={activeSet} />}
            <ResultsToolbar filters={filters} resultCount={total} />
            <ProblemsBrowser
              rows={renderedRows}
              activeSet={activeSet}
              draftSets={draftSets}
              filtersQuery={filtersQuery}
              defaultOpenId={filters.focusId || null}
            />
            <PaginationBar filters={filters} totalPages={totalPages} activeSetId={activeSet?.id ?? null} />
          </div>
        </div>
      </div>
    </>
  );
}
