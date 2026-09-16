import "server-only";

import { cookies } from "next/headers";
import { db } from "@/prisma/db";

const PROFILE_COOKIE = "getgud_profile_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/** Read-only: works in Server Components, Server Actions, and route handlers. */
export async function getProfileIdFromCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(PROFILE_COOKIE)?.value ?? null;
}

/** Mutating: only callable from a Server Action or route handler. */
export async function setProfileCookie(profileId: string): Promise<void> {
  const store = await cookies();
  store.set(PROFILE_COOKIE, profileId, {
    maxAge: COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
  });
}

export async function clearProfileCookie(): Promise<void> {
  const store = await cookies();
  store.delete(PROFILE_COOKIE);
}

/** The current profile row, or null if no cookie is set or it points at a deleted profile. */
export async function getCurrentProfile() {
  const id = await getProfileIdFromCookie();
  if (!id) return null;
  return db.orm.public.Profile.first({ id });
}

/**
 * The current profile's id, verified to still exist. "No password" means
 * anyone can create a local profile — it does not mean an arbitrary or
 * stale cookie value should be trusted as-is. Every server action that
 * reads or mutates a PracticeSet/Attempt/PracticeSetItem row MUST call
 * this and scope its query with `profileId`, never trust a bare `id` from
 * the client alone — otherwise a guessed or shared set URL lets one
 * profile read or write another's attempts.
 *
 * Throws (surfaced by Next.js as the route's error boundary) rather than
 * returning null, since every caller needs a profile to proceed — there
 * is no partial-auth state in this app.
 */
export async function requireProfileId(): Promise<string> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("No active profile — create or select one first.");
  return profile.id;
}
