// Pulls past post-answer coach conversations (Attempt.chatMessages) into a
// small set of excerpts for the AI analysis to read — the "find trouble in
// past conversations" half of src/actions/stats.ts. Kept separate from
// aggregate.ts/load.ts because it's a different kind of data (free text,
// not numeric facets) with its own token-budget concerns: only a bounded
// number of the most recent conversations are read, each truncated, so
// this stays small regardless of how many chats a profile has had.
import "server-only";

import { db } from "@/prisma/db";
import { domainLabel, skillLabel } from "@/lib/catalog";
import type { CoachMessage } from "@/lib/ai/coach-prompt";

export interface ChatExcerpt {
  skillLabel: string;
  domainLabel: string;
  isCorrect: boolean | null;
  excerpt: string;
}

const MAX_CONVERSATIONS = 8;
const MAX_EXCERPT_CHARS = 500;

function formatExcerpt(messages: CoachMessage[]): string {
  const text = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => `${m.role === "user" ? "Student" : "Coach"}: ${m.content.trim()}`)
    .join("\n");
  return text.length > MAX_EXCERPT_CHARS ? text.slice(0, MAX_EXCERPT_CHARS) + "…" : text;
}

/** The most recent conversations that actually have content, newest first,
 *  capped so the AI prompt stays small no matter how much chat history a
 *  profile has accumulated. */
export async function loadChatExcerpts(profileId: string): Promise<ChatExcerpt[]> {
  const attempts = await db.orm.public.Attempt.select("skillCode", "domainCode", "isCorrect", "submittedAt", "chatMessages")
    .where({ profileId })
    .all();

  return attempts
    .map((a) => ({
      skillCode: a.skillCode,
      domainCode: a.domainCode,
      isCorrect: a.isCorrect,
      submittedAt: a.submittedAt,
      messages: (a.chatMessages as CoachMessage[] | null) ?? [],
    }))
    .filter((a) => a.messages.length > 0)
    .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))
    .slice(0, MAX_CONVERSATIONS)
    .map((a) => ({
      skillLabel: skillLabel(a.skillCode),
      domainLabel: domainLabel(a.domainCode),
      isCorrect: a.isCorrect,
      excerpt: formatExcerpt(a.messages),
    }))
    .filter((a) => a.excerpt.length > 0);
}
