// Embed every question's content for "View similar problems"
// (src/lib/query/similar-questions.ts). Unlike the other pipeline stages this
// reads Postgres, not `data/` — it's the 4th stage, run after `pnpm load`.
//
// Usage: tsx scripts/embed-questions.ts [--dry-run] [--limit=N] [--force] [--model=<id>]
//
// --dry-run: print the question/token/cost estimate, embed nothing, never
//            opens a database connection.
// --limit=N: embed at most N questions (after skipping already-embedded ones).
// --force:   re-embed every question even if a current-contentHash row exists.
// --model:   override EMBEDDING_MODEL (src/lib/embeddings/core.ts).
//
// Resumable like `pnpm scrape`: a question is skipped when it already has a
// QuestionEmbedding row for (model, textVariant) whose contentHash matches
// Question.contentHash. Re-running after a `pnpm load` refresh re-embeds only
// what actually changed.

import { embedMany } from "ai";
import {
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_MODEL,
  EMBEDDING_TEXT_VARIANT,
  buildEmbeddingText,
  float32ToBytes,
  getEmbeddingModel,
  l2Normalize,
} from "../src/lib/embeddings/core";
import { chunk } from "./lib/qbank";

interface Args {
  dryRun: boolean;
  limit: number | null;
  force: boolean;
  model: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, limit: null, force: false, model: EMBEDDING_MODEL };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--force") args.force = true;
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length));
    else if (arg.startsWith("--model=")) args.model = arg.slice("--model=".length);
  }
  return args;
}

interface Candidate {
  id: string;
  contentHash: string;
  text: string;
}

/**
 * Questions needing an embed: everything, minus (unless --force) anything
 * already embedded under (model, textVariant) with a matching contentHash.
 * DB access is lazy — a `--dry-run` never opens a connection.
 */
async function loadCandidates(args: Args): Promise<{ candidates: Candidate[]; alreadyDone: number; total: number }> {
  const { db } = await import("../src/prisma/db");
  try {
    const questions = await db.orm.public.Question.select(
      "id",
      "contentHash",
      "stimulus",
      "stem",
      "answerOptions",
    ).all();

    let existingByQuestion = new Map<string, string>(); // questionId -> contentHash
    if (!args.force) {
      const existing = await db.orm.public.QuestionEmbedding.where({
        model: args.model,
        textVariant: EMBEDDING_TEXT_VARIANT,
      })
        .select("questionId", "contentHash")
        .all();
      existingByQuestion = new Map(existing.map((e) => [e.questionId, e.contentHash]));
    }

    let candidates: Candidate[] = [];
    let alreadyDone = 0;
    for (const q of questions) {
      const currentHash = existingByQuestion.get(q.id);
      if (currentHash === q.contentHash) {
        alreadyDone++;
        continue;
      }
      candidates.push({
        id: q.id,
        contentHash: q.contentHash,
        text: buildEmbeddingText({ stimulus: q.stimulus, stem: q.stem, answerOptions: q.answerOptions }),
      });
    }

    if (args.limit !== null) candidates = candidates.slice(0, args.limit);
    return { candidates, alreadyDone, total: questions.length };
  } finally {
    if (args.dryRun) await db.close();
    // Otherwise left open for main()'s write phase, closed there.
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

async function writeEmbeddings(args: Args, candidates: Candidate[]): Promise<void> {
  const { db } = await import("../src/prisma/db");
  const model = getEmbeddingModel(args.model);

  let written = 0;
  try {
    for (const batch of chunk(candidates, EMBEDDING_BATCH_SIZE)) {
      const { embeddings } = await embedMany({
        model,
        values: batch.map((c) => c.text),
        maxParallelCalls: 3,
      });

      await db.transaction(async (tx) => {
        for (let i = 0; i < batch.length; i++) {
          const vec = l2Normalize(Float32Array.from(embeddings[i]));
          await tx.orm.public.QuestionEmbedding.upsert({
            create: {
              questionId: batch[i].id,
              model: args.model,
              textVariant: EMBEDDING_TEXT_VARIANT,
              dim: vec.length,
              contentHash: batch[i].contentHash,
              vector: float32ToBytes(vec),
            },
            update: {
              dim: vec.length,
              contentHash: batch[i].contentHash,
              vector: float32ToBytes(vec),
            },
          });
        }
      });

      written += batch.length;
      console.log(`  embedded ${written}/${candidates.length}`);
    }
  } finally {
    await db.close();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`== Embedding questions (model=${args.model}, variant=${EMBEDDING_TEXT_VARIANT}) ==`);

  const { candidates, alreadyDone, total } = await loadCandidates(args);

  const totalChars = candidates.reduce((sum, c) => sum + c.text.length, 0);
  const truncated = candidates.filter((c) => c.text.length === 0).length;
  const estTokens = candidates.reduce((sum, c) => sum + estimateTokens(c.text), 0);
  const estCostUsd = (estTokens / 1_000_000) * 0.2; // gemini-embedding-2: $0.20/1M tok

  console.log(`  questions in db: ${total}`);
  console.log(`  already embedded (unchanged contentHash): ${alreadyDone}`);
  console.log(`  to embed: ${candidates.length}`);
  console.log(`  avg chars: ${candidates.length > 0 ? Math.round(totalChars / candidates.length) : 0}`);
  console.log(`  empty text (would embed as blank): ${truncated}`);
  console.log(`  estimated tokens: ${estTokens.toLocaleString()}`);
  console.log(`  estimated cost: $${estCostUsd.toFixed(3)}`);

  if (args.dryRun) {
    console.log("  --dry-run: no API calls or database writes performed.");
    return;
  }
  if (candidates.length === 0) {
    console.log("  nothing to embed.");
    return;
  }

  await writeEmbeddings(args, candidates);
  console.log("  done.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
