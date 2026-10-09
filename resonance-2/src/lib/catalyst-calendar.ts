import type { CalendarEvent } from "@/data/calendar";
import { RETIRED_AI_TICKERS } from "@/lib/ai-stocks";
import { eventCivilEnd, eventCivilStart } from "@/lib/calendar-desk";
import {
  addCivilDays,
  chicagoToday,
  civilWeek,
  civilWeekdayShort,
  formatChicagoClock,
  formatCivilDate,
  formatCivilMonth,
} from "@/lib/calendar-time";
import { nodePageHref } from "@/lib/node-parents";

/** Child of AI Stocks. Crypto and macro events still open from here. */
export const CATALYST_CALENDAR_HREF = "/n/ai-stocks/catalysts";

export const CATALYST_BUCKETS = [
  { id: "this-week", label: "This week" },
  { id: "next-week", label: "Next week" },
  { id: "later", label: "Later" },
] as const;

export type CatalystBucketId = (typeof CATALYST_BUCKETS)[number]["id"];

const RETIRED = new Set<string>(RETIRED_AI_TICKERS);

const BUCKET_LABEL = new Map(CATALYST_BUCKETS.map((bucket) => [bucket.id, bucket.label]));

export function isCatalystBucket(value: string): value is CatalystBucketId {
  return BUCKET_LABEL.has(value as CatalystBucketId);
}

export function catalystBucketLabel(id: CatalystBucketId): string {
  return BUCKET_LABEL.get(id) ?? id;
}

export function catalystBucketHref(id: CatalystBucketId): string {
  return `${CATALYST_CALENDAR_HREF}/${id}`;
}

export function catalystEventHref(bucket: CatalystBucketId, eventId: string): string {
  return `${catalystBucketHref(bucket)}/${eventId}`;
}

/** Retired AI names stay in the seed. They are not upcoming. */
export function isRetiredCatalystNode(node: string | undefined): boolean {
  return Boolean(node && RETIRED.has(node.toUpperCase()));
}

export type CatalystChip = {
  label: string;
  href: string | null;
};

/**
 * The node a catalyst hits.
 * Live floor pages become links. Macro, locked names, and retired tickers stay text.
 */
export function catalystNodeChips(event: CalendarEvent): CatalystChip[] {
  const node = event.node?.trim().toUpperCase();
  if (!node) return [];
  if (node === "MACRO") return [{ label: "Macro", href: null }];
  if (isRetiredCatalystNode(node)) return [{ label: node, href: null }];
  return [{ label: node, href: nodePageHref(node) }];
}

export function catalystDateLabel(event: CalendarEvent): string {
  const start = eventCivilStart(event);
  const end = eventCivilEnd(event);
  if (!start) return "";
  if (event.datePrecision === "month") return formatCivilMonth(start);
  if (end && end !== start) return `${formatCivilDate(start)} – ${formatCivilDate(end)}`;
  return formatCivilDate(start);
}

/** Chicago clock. A row with no source time does not print midnight. */
export function catalystTimeLabel(event: CalendarEvent): string {
  if (event.datePrecision === "month") return "Month";
  if (event.datePrecision === "window") return "Window";
  if (event.allDay) return "All day";
  return formatChicagoClock(event.start);
}

export function catalystStatusLabel(event: CalendarEvent): string {
  if (event.status === "confirmed") return "Confirmed";
  if (event.status === "tentative") return "Tentative";
  return event.status;
}

function shortWhen(day: string): string {
  const date = formatCivilDate(day).replace(/ \d{4}$/, "");
  const weekday = civilWeekdayShort(day);
  return weekday ? `${weekday} ${date}` : date;
}

export type CatalystListItem = {
  id: string;
  title: string;
  when: string;
  dateLabel: string;
  timeLabel: string;
  href: string;
};

export type CatalystBucketView = {
  id: CatalystBucketId;
  label: string;
  href: string;
  count: number;
  preview: CatalystListItem[];
  events: CatalystListItem[];
};

function placementDay(event: CalendarEvent, today: string): string | null {
  const start = eventCivilStart(event);
  const end = eventCivilEnd(event);
  if (!start || !end || end < today) return null;
  return start >= today ? start : today;
}

/**
 * America/Chicago Monday–Sunday.
 * A row that already started stays in the current week while it is still open.
 * A row that starts later uses the week of its start. Retired nodes are omitted.
 */
export function catalystBucketId(event: CalendarEvent, now: Date): CatalystBucketId | null {
  if (event.kind !== "catalyst") return null;
  if (isRetiredCatalystNode(event.node)) return null;
  if (event.status === "history") return null;
  if (!event.title.trim()) return null;
  const today = chicagoToday(now);
  const day = placementDay(event, today);
  if (!day) return null;
  const week = civilWeek(today);
  const thisMonday = week[0];
  const thisSunday = week[6];
  if (!thisMonday || !thisSunday) return null;
  const nextSunday = addCivilDays(thisSunday, 7);
  if (day <= thisSunday) return "this-week";
  if (day <= nextSunday) return "next-week";
  return "later";
}

function listItem(event: CalendarEvent, bucket: CatalystBucketId, today: string): CatalystListItem {
  const start = eventCivilStart(event);
  const whenDay = start && start >= today ? start : today;
  return {
    id: event.id,
    title: event.title.trim(),
    when: shortWhen(whenDay),
    dateLabel: catalystDateLabel(event),
    timeLabel: catalystTimeLabel(event),
    href: catalystEventHref(bucket, event.id),
  };
}

function byStart(today: string) {
  return (left: CalendarEvent, right: CalendarEvent) => {
    const leftStart = eventCivilStart(left);
    const rightStart = eventCivilStart(right);
    const leftAhead = leftStart >= today ? 0 : 1;
    const rightAhead = rightStart >= today ? 0 : 1;
    if (leftAhead !== rightAhead) return leftAhead - rightAhead;
    if (leftStart !== rightStart) return leftStart < rightStart ? -1 : 1;
    const title = left.title.localeCompare(right.title);
    if (title !== 0) return title;
    return left.id.localeCompare(right.id);
  };
}

/** This week, next week, and later. Later is empty when nothing sits past next Sunday. */
export function catalystBuckets(
  events: readonly CalendarEvent[],
  now: Date,
): CatalystBucketView[] {
  const today = chicagoToday(now);
  const grouped = new Map<CatalystBucketId, CalendarEvent[]>(
    CATALYST_BUCKETS.map((bucket) => [bucket.id, []]),
  );
  for (const event of events) {
    const bucket = catalystBucketId(event, now);
    if (!bucket) continue;
    grouped.get(bucket)?.push(event);
  }
  return CATALYST_BUCKETS.map((bucket) => {
    const rows = [...(grouped.get(bucket.id) ?? [])].sort(byStart(today));
    const items = rows.map((event) => listItem(event, bucket.id, today));
    return {
      id: bucket.id,
      label: bucket.label,
      href: catalystBucketHref(bucket.id),
      count: items.length,
      preview: items.slice(0, 2),
      events: items,
    };
  });
}

export function catalystBucketEvents(
  events: readonly CalendarEvent[],
  bucket: CatalystBucketId,
  now: Date,
): CatalystListItem[] {
  return catalystBuckets(events, now).find((item) => item.id === bucket)?.events ?? [];
}

/** Soonest upcoming row for the AI Stocks parent card. */
export function catalystEntryLine(events: readonly CalendarEvent[], now: Date): string | null {
  const next = catalystBuckets(events, now).flatMap((bucket) => bucket.events)[0];
  if (!next?.title.trim() || !next.when.trim()) return null;
  return `${next.when} · ${next.title}`;
}

export function catalystUpcomingCount(events: readonly CalendarEvent[], now: Date): number {
  return catalystBuckets(events, now).reduce((sum, bucket) => sum + bucket.count, 0);
}
