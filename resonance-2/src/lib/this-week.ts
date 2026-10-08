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

const BOUT =
  /([a-z0-9][a-z0-9.'’-]*(?:\s+[a-z0-9][a-z0-9.'’-]*)*)\s+vs\.?\s+([a-z0-9][a-z0-9.'’-]*(?:\s+[a-z0-9][a-z0-9.'’-]*)*)/i;
const SEGMENT = /\b(early prelims|prelims|main card|fight card|early-prelims|main-card)\b/gi;
const MONTH_DAY =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/gi;
const FIGHT_HREF = /^\/fights\/([a-z0-9][a-z0-9-]*)(?:\/|$)/;

function whenLabel(day: string): string {
  const date = formatCivilDate(day).replace(/ \d{4}$/, "");
  const weekday = civilWeekdayShort(day);
  return weekday ? `${weekday} ${date}` : date;
}

/** Weekday ops such as Daily Brief. Real fight, macro, and catalyst rows stay. */
export function isStandingRoutine(event: CalendarEvent): boolean {
  if (event.lane === "cadence") return true;
  if (event.recurrence) return true;
  return /\bdaily brief\b/i.test(event.title);
}

/** Card identity with the bout and the segment label removed. */
export function eventStem(title: string): string {
  return title
    .toLowerCase()
    .replace(BOUT, " ")
    .replace(SEGMENT, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fightSlugFromHref(href: string): string {
  return FIGHT_HREF.exec(href)?.[1] ?? "";
}

function cleanDisplayTitle(title: string): string {
  const bout = BOUT.exec(title);
  let head = bout ? title.slice(0, bout.index) : title;
  head = head.replace(SEGMENT, " ").replace(MONTH_DAY, " ");
  head = head
    .replace(/[,:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const names = bout?.[0]?.replace(/\s+/g, " ").trim();
  if (head && names) return `${head}: ${names}`;
  return (head || title).replace(/\s+/g, " ").trim();
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

type PendingItem = ThisWeekItem & {
  day: string;
  slug: string;
  stem: string;
};

function sameCard(left: PendingItem, right: PendingItem): boolean {
  if (left.slug && right.slug && left.slug === right.slug) return true;
  return Boolean(left.stem && right.stem && left.stem === right.stem);
}

function pillTitle(group: readonly PendingItem[], targets: readonly FightLinkTarget[]): string {
  if (group.length === 1) return group[0]?.title ?? "";
  const slug = group.map((item) => item.slug).find(Boolean) ?? "";
  const named = slug ? targets.find((target) => target.slug === slug)?.title.trim() : "";
  if (named) return named;
  const source = group.find((item) => BOUT.test(item.title)) ?? group[0];
  return source ? cleanDisplayTitle(source.title) : "";
}

/** Prelims and the main card of one fight, on one day, become one pill. */
function collapseCards(items: readonly PendingItem[], targets: readonly FightLinkTarget[]): ThisWeekItem[] {
  const parent = items.map((_, index) => index);
  const find = (index: number): number => {
    let cursor = index;
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]] ?? cursor;
      cursor = parent[cursor] ?? cursor;
    }
    return cursor;
  };
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      const leftItem = items[left];
      const rightItem = items[right];
      if (!leftItem || !rightItem || leftItem.day !== rightItem.day) continue;
      if (!sameCard(leftItem, rightItem)) continue;
      parent[find(right)] = find(left);
    }
  }
  const groups = new Map<number, PendingItem[]>();
  items.forEach((item, index) => {
    const root = find(index);
    const group = groups.get(root);
    if (group) group.push(item);
    else groups.set(root, [item]);
  });
  return [...groups.values()].map((group) => {
    const first = [...group].sort((left, right) => Date.parse(left.start) - Date.parse(right.start))[0];
    const fight = group.find((item) => item.href.startsWith("/fights/"));
    return {
      id: group.map((item) => item.id).join("+"),
      when: first?.when ?? "",
      title: pillTitle(group, targets),
      href: fight?.href ?? first?.href ?? "/calendar",
      start: first?.start ?? "",
    };
  });
}

/**
 * Upcoming calendar rows from now through the next seven days, soonest first.
 * Standing cadence rows are left out. Segments of one fight on one day collapse
 * into a single pill. History and continuation days are skipped. An empty result hides the strip.
 */
export function thisWeekItems(
  events: readonly CalendarEvent[],
  now: Date,
  targets: readonly FightLinkTarget[] = [],
): ThisWeekItem[] {
  const today = chicagoToday(now);
  const lastDay = addCivilDays(today, 7);
  const horizon = now.getTime() + WEEK_MS;
  const items: PendingItem[] = [];

  for (let day = today; day <= lastDay; day = addCivilDays(day, 1)) {
    for (const item of occurrencesOnDay(events, day)) {
      if (item.continues) continue;
      if (item.event.status === "history") continue;
      if (isStandingRoutine(item.event)) continue;
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
      const href = siteHref(item.event, events, targets);
      items.push({
        id: `${item.event.id}:${day}`,
        day,
        when,
        title,
        href,
        start: item.start,
        slug: item.event.eventSlug || fightSlugFromHref(href),
        stem: eventStem(title),
      });
    }
  }

  items.sort((left, right) => {
    const delta = Date.parse(left.start) - Date.parse(right.start);
    if (delta !== 0) return delta;
    return left.id.localeCompare(right.id);
  });
  return collapseCards(items, targets)
    .sort((left, right) => {
      const delta = Date.parse(left.start) - Date.parse(right.start);
      if (delta !== 0) return delta;
      return left.id.localeCompare(right.id);
    })
    .slice(0, THIS_WEEK_LIMIT);
}
