"use server";

import { redirect } from "next/navigation";
import { db } from "@/prisma/db";
import { setProfileCookie } from "@/lib/profile";

const NAME_MAX_LENGTH = 40;

export interface CreateProfileState {
  error: string;
}

export async function createProfile(
  _prevState: CreateProfileState,
  formData: FormData,
): Promise<CreateProfileState> {
  const name = String(formData.get("name") ?? "").trim();
  if (name === "") return { error: "Enter a name." };
  if (name.length > NAME_MAX_LENGTH) return { error: `Name must be ${NAME_MAX_LENGTH} characters or fewer.` };

  const existing = await db.orm.public.Profile.first({ name });
  if (existing) {
    await setProfileCookie(existing.id);
    redirect("/");
  }

  const now = new Date().toISOString();
  const profile = await db.orm.public.Profile.create({
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    lastSeenAt: now,
  });
  await setProfileCookie(profile.id);
  redirect("/");
}
