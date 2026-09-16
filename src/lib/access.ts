import "server-only";

import { db } from "@/prisma/db";
import { requireProfileId } from "@/lib/profile";

/**
 * Shared ownership check for every server action / route handler that
 * takes `(setId, position)` from the client — see requireProfileId's doc
 * comment for why this can't be skipped. Not a "use server" file itself
 * (every export there becomes a client-callable action) — plain actions
 * and route handlers both import this instead.
 */
export async function getOwnedItem(setId: string, position: number) {
  const profileId = await requireProfileId();
  const set = await db.orm.public.PracticeSet.first({ id: setId, profileId });
  if (!set) throw new Error("Set not found.");
  const item = await db.orm.public.PracticeSetItem.where({ setId, position }).first();
  if (!item) throw new Error("Question not found in this set.");
  const question = await db.orm.public.Question.first({ id: item.questionId });
  if (!question) throw new Error("Question content missing.");
  return { profileId, set, item, question };
}
