import { streamText } from "ai";
import { getOwnedItem } from "@/lib/access";
import { getHintModel, hintsConfigured } from "@/lib/ai/hint-provider";
import { buildHintPrompt } from "@/lib/ai/hint-prompt";
import { db } from "@/prisma/db";
import type { AnswerOption } from "@/lib/grading";

interface HintRequestBody {
  setId: string;
  position: number;
  level: 1 | 2 | 3;
}

async function recordHintUsage(attemptId: string, questionId: string, level: number): Promise<void> {
  const attempt = await db.orm.public.Attempt.first({ id: attemptId });
  if (!attempt) return;
  await db.orm.public.Attempt.where({ id: attemptId }).update({
    hintsUsed: attempt.hintsUsed + 1,
    maxHintLevel: Math.max(attempt.maxHintLevel, level),
  });

  const existingHint = await db.orm.public.AttemptHint.first({ attemptId, questionId, level });
  if (!existingHint) {
    await db.orm.public.AttemptHint.create({
      id: crypto.randomUUID(),
      attemptId,
      questionId,
      level,
      requestedAt: new Date().toISOString(),
    });
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!hintsConfigured()) {
    return Response.json(
      { error: "Hints aren't configured — set OPENROUTER_API_KEY to enable them." },
      { status: 503 },
    );
  }

  let body: HintRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.setId || typeof body.position !== "number" || ![1, 2, 3].includes(body.level)) {
    return Response.json({ error: "setId, position, and level (1-3) are required." }, { status: 400 });
  }

  let owned: Awaited<ReturnType<typeof getOwnedItem>>;
  try {
    owned = await getOwnedItem(body.setId, body.position);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Not found." }, { status: 404 });
  }
  const { item, question } = owned;

  // Cache hit — no generation needed, return the stored hint as a plain
  // text body (same shape the client gets from a fresh stream).
  const cached = await db.orm.public.QuestionHint.first({ questionId: question.id, level: body.level });
  if (cached) {
    await recordHintUsage(item.id, question.id, body.level);
    return new Response(cached.content, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const { system, prompt } = buildHintPrompt({
    type: item.type as "mcq" | "spr",
    stimulus: question.stimulus,
    stem: question.stem,
    options: question.answerOptions as AnswerOption[] | null,
    rationale: question.rationale,
    level: body.level,
  });

  const model = getHintModel();
  const result = streamText({
    model,
    system,
    prompt,
    onEnd: async ({ text }) => {
      if (!text.trim()) return;
      await db.orm.public.QuestionHint.create({
        questionId: question.id,
        level: body.level,
        content: text.trim(),
        model: process.env.OPENROUTER_MODEL || "openai/gpt-5.6-luna",
        createdAt: new Date().toISOString(),
      });
      await recordHintUsage(item.id, question.id, body.level);
    },
  });

  return result.toTextStreamResponse();
}
