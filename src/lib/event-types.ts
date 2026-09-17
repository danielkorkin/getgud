// Shared between the client event buffer (src/lib/events.ts) and the
// ingest route handler (src/app/api/events/route.ts) — kept in its own
// plain module so the client bundle never pulls in the route file (which
// imports server-only DB code) just to read this list.
export const EVENT_TYPES = [
  "view_enter",
  "view_exit",
  "focus",
  "blur",
  "select_option",
  "change_option",
  "eliminate_option",
  "restore_option",
  "mark_review",
  "hint_request",
  "hint_shown",
  "calc_open",
  "calc_close",
  "reference_open",
  "highlight_add",
  "highlight_remove",
  "note_save",
  "submit",
  "reveal_feedback",
  "nav_next",
  "nav_prev",
  "nav_jump",
  "set_start",
  "set_complete",
  "reveal_answer",
  "coach_open",
  "coach_message",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];
