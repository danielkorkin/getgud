"use client";

import { createAvatar } from "@bible-strong/avatar-react";
import "@bible-strong/avatar-react/styles.css";
import strobiDefinition from "@/avatars/strobi.avatar.json";

const StrobiAvatar = createAvatar(strobiDefinition);

export { StrobiAvatar, strobiDefinition };
export type { AvatarController } from "@bible-strong/avatar-react";
