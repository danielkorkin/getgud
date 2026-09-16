import { db } from "@/prisma/db";
import { requireProfileId } from "@/lib/profile";
import { ingestEventBatch, type IncomingEvent } from "@/lib/ingest-events";

interface EventBatchBody {
  setId: string;
  attemptId: string;
  questionId: string;
  events: IncomingEvent[];
}

/**
 * Ingests a batch of client-side telemetry events. Accepts both a normal
 * fetch POST and a `navigator.sendBeacon` body (a Blob with no custom
 * headers, but same-origin — so cookies, and therefore profile identity,
 * still arrive normally). The actual DB write lives in
 * src/lib/ingest-events.ts — see the comment there for why.
 */
export async function POST(request: Request): Promise<Response> {
  let body: EventBatchBody;
  try {
    // sendBeacon bodies are sent as a Blob without a reliable Content-Type;
    // .text() + JSON.parse works for both that and a normal JSON fetch.
    body = JSON.parse(await request.text());
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.setId || !body.attemptId || !Array.isArray(body.events) || body.events.length === 0) {
    return Response.json({ error: "setId, attemptId, and a non-empty events array are required." }, { status: 400 });
  }

  const profileId = await requireProfileId();
  const set = await db.orm.public.PracticeSet.first({ id: body.setId, profileId });
  if (!set) return Response.json({ error: "Set not found." }, { status: 404 });
  const attempt = await db.orm.public.Attempt.first({ id: body.attemptId, setId: body.setId });
  if (!attempt) return Response.json({ error: "Attempt not found." }, { status: 404 });

  const inserted = await ingestEventBatch({
    attemptId: attempt.id,
    profileId,
    setId: body.setId,
    questionId: body.questionId,
    events: body.events,
  });

  return Response.json({ ok: true, inserted });
}
