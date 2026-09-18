// Display labels for the Learn section's enums.
//
// A plain module with no "use client" and no JSX, deliberately. These maps
// are read from both client components (the filtered resource directory)
// and Server Components (the guide page's eyebrow), and Next turns *every*
// export of a "use client" module into a client reference — so a server
// component reading a constant that lives in a client file throws at
// runtime rather than rendering. Keeping the constants here, separate from
// the card components that also use them, is what makes both sides safe.

import type { GuideKind, ResourceCost, ResourceKind } from "@/resources";

export const KIND_LABEL: Record<ResourceKind, string> = {
  course: "Course",
  "video-channel": "Channel",
  playlist: "Playlist",
  practice: "Practice",
  article: "Article",
  reference: "Reference",
  tool: "Tool",
  book: "Book",
  community: "Community",
};

export const COST_LABEL: Record<ResourceCost, string> = {
  free: "Free",
  "free-account": "Free · account",
  freemium: "Free tier",
  paid: "Paid",
};

// Free things are the point of a curated shelf for a self-hosted study
// tool, so they get the affirmative color and paid things stay neutral —
// never the red/warning treatment, which would misrepresent a good book as
// a problem.
export const COST_VARIANT: Record<ResourceCost, "tag-green" | "tag-blue" | "secondary"> = {
  free: "tag-green",
  "free-account": "tag-green",
  freemium: "tag-blue",
  paid: "secondary",
};

export const GUIDE_KIND_LABEL: Record<GuideKind, string> = {
  cheatsheet: "Cheat sheet",
  strategy: "Strategy",
  plan: "Study plan",
};
