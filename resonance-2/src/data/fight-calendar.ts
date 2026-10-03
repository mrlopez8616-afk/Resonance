import type { CalendarEvent } from "@/data/calendar";

/**
 * UFC 332 session rows. Kind `fight` sits beside catalysts.
 * These are not lanes and they are not catalyst nodes.
 * Idempotent by id when the calendar catalog is merged.
 */
export const fightCalendar: CalendarEvent[] = [
  {
    id: "ufc-332-early-prelims",
    kind: "fight",
    start: "2026-10-03T15:00:00-05:00",
    title: "UFC 332 early prelims",
    status: "scheduled",
    writer: "founder",
    link: "/fights/ufc-332",
    location: "Delta Center, Salt Lake City",
    note: "UFC 332: Silva vs Wang. Early prelims 3:00 PM CT.",
  },
  {
    id: "ufc-332-prelims",
    kind: "fight",
    start: "2026-10-03T17:00:00-05:00",
    title: "UFC 332 prelims",
    status: "scheduled",
    writer: "founder",
    link: "/fights/ufc-332",
    location: "Delta Center, Salt Lake City",
    note: "UFC 332: Silva vs Wang. Prelims 5:00 PM CT.",
  },
  {
    id: "ufc-332-main-card",
    kind: "fight",
    start: "2026-10-03T19:00:00-05:00",
    title: "UFC 332 main card",
    status: "scheduled",
    writer: "founder",
    link: "/fights/ufc-332",
    location: "Delta Center, Salt Lake City",
    note: "UFC 332: Silva vs Wang. Main card 7:00 PM CT.",
  },
];
