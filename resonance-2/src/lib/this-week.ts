import type { CalendarEvent } from "@/data/calendar";
import { calendarOpenHref, calendarFightHref } from "@/lib/fight-pages";
import { occurrencesOnDay } from "@/lib/calendar-desk";
import {
  addCivilDays,
  chicagoToday,
  civilWeekdayShort,
  formatCivilDate,
} from "@/lib/calendar-time";
import type { FightLinkTarget } from "@/lib/fight-desk";

/** Soonest items kept on the home strip. */
export const THIS_WEEK_LIMIT = 4;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type ThisWeekItem = {
  id: string;
  when: string;
  title: string;
  href: string;
  start: string;
};

function whenLabel(day: string): string {
  const date = formatCivilDate(day).replace(/ \d{4}$/, "");
  const weekday = civilWeekdayShort(day);
  return weekday ? `${weekday} ${date}` : date;
}

function siteHref(
  event: CalendarEvent,
  events: readonly CalendarEvent[],
  targets: readonly FightLinkTarget[],
): string {
  const fight = calendarFightHref(event, { events, targets });
  if (fight?.startsWith("/fights/")) return fight;
  const open = calendarOpenHref(event, { events, targets });
  if (open && open.startsWith("/") && !open.startsWith("//")) return open;
  return "/calendar";
}

/**
 * Upcoming calendar rows from now through the next seven days, soonest first.
 * A row already in progress on a later day of a multi-day span is skipped.
 * History rows are skipped. An empty result hides the strip.
 */
export function thisWeekItems(
  events: readonly CalendarEvent[],
  now: Date,
  targets: readonly FightLinkTarget[] = [],
): ThisWeekItem[] {
  const today = chicagoToday(now);
  const lastDay = addCivilDays(today, 7);
  const horizon = now.getTime() + WEEK_MS;
  const items: ThisWeekItem[] = [];

  for (let day = today; day <= lastDay; day = addCivilDays(day, 1)) {
    for (const item of occurrencesOnDay(events, day)) {
      if (item.continues) continue;
      if (item.event.status === "history") continue;
      const title = item.event.title.trim();
      if (!title) continue;
      const startMs = Date.parse(item.start);
      if (!Number.isFinite(startMs)) continue;
      const allDay = item.event.allDay === true || item.event.datePrecision === "window";
      if (allDay) {
        if (startMs > horizon) continue;
      } else if (startMs < now.getTime() || startMs > horizon) {
        continue;
      }
      const when = whenLabel(day);
      if (!when.trim()) continue;
      items.push({
        id: `${item.event.id}:${day}`,
        when,
        title,
        href: siteHref(item.event, events, targets),
        start: item.start,
      });
    }
  }

  items.sort((left, right) => {
    const delta = Date.parse(left.start) - Date.parse(right.start);
    if (delta !== 0) return delta;
    return left.id.localeCompare(right.id);
  });
  return items.slice(0, THIS_WEEK_LIMIT);
}
