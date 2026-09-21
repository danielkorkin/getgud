// Throwaway probe for the "Smart select" feature (see src/lib/query/
// smart-select.ts): does embedding a HyDE-style synthetic exemplar retrieve
// better matches than embedding the user's bare prompt, on THIS bank?
//
// VERDICT (kept for the record, not re-run automatically): NO — raw-prompt
// embedding wins outright. Across 6 test prompts, raw-prompt retrieval was
// on-topic every time. HyDE was a wash at best (marginally reordered an
// already-good "poems with figurative language" result) and catastrophically
// wrong twice: on "Shakespearean or early-modern English" and "semicolon
// joining two independent clauses" — both Reading & Writing style/register
// queries — the synthetic exemplar's embedding collided with bare Math
// equations ("3a + 4b = 25", "y = 18 - 5x") at ~0.74-0.78 cosine, well above
// the genuine top hits. Likely cause: those Math items' embedding text is
// just a short equation with no prose, and something about the LLM-written
// exemplar's phrasing (or its unusual length/style vs. real SAT text) creates
// a spurious high-cosine collision with short, sparse vectors. Raw-prompt
// embeddings never showed this failure. `smart-select.ts` therefore embeds
// the user's prompt directly — see its file comment.
//
// Not wired into any pnpm script — run directly with:
//   pnpm exec tsx scripts/probe-hyde.ts
//
// Two import constraints, both load-bearing (see src/lib/embeddings/core.ts's
// file comment): core.ts has no `server-only` import so it's safe to import
// under plain tsx, but `@/lib/content/plain-text` and `@/lib/ai/hint-provider`
// both DO import `server-only` and will crash on load here — don't touch them.
// Build the chat model inline instead of importing getAnalysisModel().

import { embed, generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { EMBEDDING_MODEL, buildEmbeddingIndex, getEmbeddingModel, l2Normalize } from "../src/lib/embeddings/core";

const PROMPTS = [
  "passages that are poems with figurative language",
  "Shakespearean or early-modern English",
  "semicolon joining two independent clauses",
  "data table with a trend question",
  "author's tone is skeptical",
  "systems of linear equations with no solution",
];

function stripHtml(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chatModel() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set.");
  const openrouter = createOpenRouter({ apiKey });
  return openrouter(process.env.OPENROUTER_MODEL || "openai/gpt-5.6-luna");
}

async function embedQuery(text: string): Promise<Float32Array> {
  const { embedding } = await embed({ model: getEmbeddingModel(), value: text });
  return l2Normalize(Float32Array.from(embedding));
}

async function hydeExemplars(prompt: string): Promise<string> {
  const { text } = await generateText({
    model: chatModel(),
    system:
      "You write short synthetic SAT-style passage/question exemplars for a search system. " +
      "Output only the exemplar text, no preamble, no labels.",
    prompt:
      `Write 2 short synthetic SAT Reading & Writing or Math passages/stems (2-4 sentences each) ` +
      `that strongly exhibit this quality: "${prompt}". These are search queries, not real questions — ` +
      `invented content is fine. Separate the two with a blank line.`,
  });
  return text;
}

async function main() {
  const { db } = await import("../src/prisma/db");
  try {
    const rows = await db.orm.public.QuestionEmbedding.where({
      model: EMBEDDING_MODEL,
      textVariant: "full",
    })
      .select("questionId", "dim", "vector")
      .all();
    console.log(`Loaded ${rows.length} embedding rows.\n`);
    const index = buildEmbeddingIndex(rows);

    const questionIds = [...new Set(rows.map((r) => r.questionId))];
    const questions = await db.orm.public.Question.where((q) => q.id.in(questionIds))
      .select("id", "stimulus", "stem")
      .all();
    const byId = new Map(questions.map((q) => [q.id, q]));

    function printTop(label: string, vec: Float32Array) {
      const hits = index.topKForVector(vec, 10);
      console.log(`  ${label}:`);
      for (const h of hits) {
        const q = byId.get(h.id);
        const text = stripHtml(q?.stimulus ?? null) || stripHtml(q?.stem ?? null);
        console.log(`    ${h.score.toFixed(3)}  ${h.id}  ${text.slice(0, 200)}`);
      }
    }

    for (const prompt of PROMPTS) {
      console.log(`=== "${prompt}" ===`);

      const rawVec = await embedQuery(prompt);
      printTop("RAW PROMPT", rawVec);

      const exemplars = await hydeExemplars(prompt);
      const hydeVec = await embedQuery(exemplars);
      printTop("HYDE", hydeVec);

      console.log(`  (HyDE exemplar text used: ${exemplars.slice(0, 160).replace(/\n/g, " ")}...)\n`);
    }
  } finally {
    await db.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
