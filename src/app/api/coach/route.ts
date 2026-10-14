import { streamText } from "ai";
import { getOwnedItem } from "@/lib/access";
import { aiNotConfiguredMessage, getCoachModel, hintsConfigured } from "@/lib/ai/hint-provider";
import { buildChatPrompt, buildSummaryPrompt, type CoachContextInput, type CoachMessage } from "@/lib/ai/coach-prompt";
import { db } from "@/prisma/db";
import type { AnswerOption } from "@/lib/grading";

const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2000;

interface CoachRequestBody {
  setId: string;
  position: number;
  kind: "summary" | "chat";
  messages?: CoachMessage[];
}

export async function POST(request: Request): Promise<Response> {
  if (!hintsConfigured()) {
    return Response.json(
      { error: aiNotConfiguredMessage("The coach") },
      { status: 503 },
    );
  }

  let body: CoachRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.setId || typeof body.position !== "number" || (body.kind !== "summary" && body.kind !== "chat")) {
    return Response.json({ error: "setId, position, and kind ('summary'|'chat') are required." }, { status: 400 });
  }
  if (body.kind === "chat" && !Array.isArray(body.messages)) {
    return Response.json({ error: "chat requires a messages array." }, { status: 400 });
  }

  let owned: Awaited<ReturnType<typeof getOwnedItem>>;
  try {
    // No policy argument — practice-only default, same guard as /api/hint.
    // This closes /api/coach to exam-mode sets automatically.
    owned = await getOwnedItem(body.setId, body.position);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Not found." }, { status: 404 });
  }
  const { item, question } = owned;

  const attempt = await db.orm.public.Attempt.first({ id: item.id });
  if (!attempt) {
    return Response.json({ error: "View the question before asking the coach." }, { status: 400 });
  }
  // The coach only ever discusses an answered question — pre-answer it's
  // hints-only. Otherwise the system prompt (which may state the correct
  // answer) is the only thing standing between the student and the answer.
  if (attempt.status !== "answered") {
    return Response.json({ error: "Answer the question first." }, { status: 403 });
  }

  const options = question.answerOptions as AnswerOption[] | null;
  const correctOption = options?.find((o) => question.correctKeys.includes(o.id)) ?? null;

  const [attemptHints, questionHints] = await Promise.all([
    db.orm.public.AttemptHint.where({ attemptId: item.id }).all(),
    db.orm.public.QuestionHint.where({ questionId: question.id }).all(),
  ]);
  const hintContentByLevel = new Map(questionHints.map((h) => [h.level, h.content]));
  const usedHints = attemptHints
    .map((h) => ({ level: h.level, content: hintContentByLevel.get(h.level) ?? "" }))
    .filter((h) => h.content)
    .sort((a, b) => a.level - b.level);

  const context: CoachContextInput = {
    type: item.type as "mcq" | "spr",
    stimulus: question.stimulus,
    stem: question.stem,
    options,
    rationale: question.rationale,
    correctLetter: correctOption?.letter ?? null,
    correctAnswer: question.correctAnswer,
    selectedLetter: attempt.selectedLetter,
    spResponse: attempt.spResponse,
    isCorrect: attempt.isCorrect,
    answerRevealed: attempt.answerRevealed,
    usedHints,
  };

  const model = getCoachModel();

  if (body.kind === "summary") {
    if (attempt.isCorrect !== false) {
      return Response.json({ error: "A summary is only available for a wrong answer." }, { status: 400 });
    }
    const { system, prompt } = buildSummaryPrompt(context);
    const result = streamText({ model, system, prompt });
    return result.toTextStreamResponse();
  }

  const rawMessages = body.messages!;
  if (rawMessages.length === 0 || rawMessages.length > MAX_MESSAGES) {
    return Response.json({ error: `messages must contain 1-${MAX_MESSAGES} entries.` }, { status: 400 });
  }
  const messages: CoachMessage[] = [];
  for (const m of rawMessages) {
    if ((m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") {
      return Response.json({ error: "Each message needs a role ('user'|'assistant') and string content." }, { status: 400 });
    }
    if (m.content.length > MAX_MESSAGE_CHARS) {
      return Response.json({ error: `Each message must be under ${MAX_MESSAGE_CHARS} characters.` }, { status: 400 });
    }
    messages.push({ role: m.role, content: m.content });
  }

  const { system, messages: modelMessages } = buildChatPrompt(context, messages);
  const result = streamText({ model, system, messages: modelMessages });
  return result.toTextStreamResponse();
}
