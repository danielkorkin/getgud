import "server-only";

import { db } from "@/prisma/db";
import { requireProfileId } from "@/lib/profile";

/**
 * Access policy for a `(setId, position)` lookup. Governs what an exam-mode
 * set is allowed to do through this gate:
 *
 *   'practice-only'  (default) throws unless `set.mode === 'practice'`.
 *                    This is what closes every existing practice caller
 *                    (getRenderedItem, submitAnswer, completeSet,
 *                    POST /api/hint) to exam sets, with zero code change at
 *                    those call sites — getRenderedItem/submitAnswer reveal
 *                    the rationale and correct answer for any answered
 *                    attempt, which would leak exam answers mid-test if
 *                    ever reachable for an exam set.
 *   'exam-write'     practice: allowed. exam: the module covering
 *                    `position` must be status='active' and
 *                    now <= deadlineAt + GRACE_MS.
 *   'exam-telemetry' practice: allowed. exam: the module must exist, but no
 *                    deadline check — a pagehide flush can legitimately
 *                    land a few hundred ms after the timer hits 0:00.
 */
export type ItemAccessPolicy = "practice-only" | "exam-write" | "exam-telemetry";

const GRACE_MS = 3000;

/**
 * Shared ownership check for every server action / route handler that
 * takes `(setId, position)` from the client — see requireProfileId's doc
 * comment for why this can't be skipped. Not a "use server" file itself
 * (every export there becomes a client-callable action) — plain actions
 * and route handlers both import this instead.
 */
export async function getOwnedItem(setId: string, position: number, policy: ItemAccessPolicy = "practice-only") {
  const profileId = await requireProfileId();
  const set = await db.orm.public.PracticeSet.first({ id: setId, profileId });
  if (!set) throw new Error("Set not found.");

  if (policy === "practice-only" && set.mode !== "practice") {
    throw new Error("This action is not available for exam sets.");
  }

  const item = await db.orm.public.PracticeSetItem.where({ setId, position }).first();
  if (!item) throw new Error("Question not found in this set.");
  const question = await db.orm.public.Question.first({ id: item.questionId });
  if (!question) throw new Error("Question content missing.");

  let examModule: Awaited<ReturnType<typeof db.orm.public.ExamModule.first>> = null;
  if (policy === "exam-write" || policy === "exam-telemetry") {
    if (set.mode === "exam") {
      // Only 4 modules ever exist per session — fetch all and find the one
      // covering `position` in JS rather than expressing a
      // column-vs-column range predicate in the query builder.
      const modules = await db.orm.public.ExamModule.where({ sessionId: setId }).all();
      examModule = modules.find((m) => position >= m.startPosition && position < m.startPosition + m.itemCount) ?? null;
      if (!examModule) throw new Error("Question not found in this exam session.");

      if (policy === "exam-write") {
        if (examModule.status !== "active") {
          throw new Error("This module is not currently active.");
        }
        if (examModule.deadlineAt) {
          const deadline = new Date(examModule.deadlineAt).getTime() + GRACE_MS;
          if (Date.now() > deadline) {
            throw new Error("This module's time has expired.");
          }
        }
      }
    }
  }

  return { profileId, set, item, question, examModule };
}
