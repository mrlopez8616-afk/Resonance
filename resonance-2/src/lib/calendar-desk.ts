import {
  CALENDAR_LANE_CHIP,
  CALENDAR_LANES,
  isCatalystNode,
  type CalendarEvent,
  type CalendarLane,
  type CatalystNode,
} from "@/data/calendar";
import { isCalendarLane } from "@/lib/calendar-event";
import {
  addCivilDays,
  chicagoDay,
  chicagoInstant,
  civilMonthKey,
  civilWeek,
  formatChicagoClock,
  formatChicagoIso,
  formatChicagoStamp,
  formatCivilDate,
  formatCivilMonth,
  isCivilDay,
  isCivilWeekday,
} from "@/lib/calendar-time";

export const CALENDAR_VIEWS = ["day", "week", "month"] as const;

export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export type CalendarOccurrence = {
  event: CalendarEvent;
  /** Instant of this occurrence, ISO-8601. */
  start: string;
  day: string;
  /** True when this civil day is after the event's first day. */
  continues?: boolean;
};

export type CalendarDeskQuery = {
  day: string;
  view: CalendarView;
  lane: CalendarLane | "";
  node: CatalystNode | "";
  event: string;
};

type RawParam = string | string[] | undefined;

export type CalendarDeskSearch = {
  day?: RawParam;
  view?: RawParam;
  lane?: RawParam;
  node?: RawParam;
  event?: RawParam;
};

export type CalendarChip = {
  id: string;
  label: string;
  title: string;
  tone: string;
  tentative: boolean;
  window: boolean;
};

/** Standing weekday rhythm. A posted row with the dated id replaces it that day. */
export const STANDING_DAILY_BRIEF_ID = "cadence-daily-brief";

export const MONTH_CHIP_LIMIT = 3;

function firstParam(value: RawParam): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

export function dailyBriefRowId(day: string): string {
  return `cadence-daily-brief-${day}`;
}

export function parseCalendarDeskQuery(
  raw: CalendarDeskSearch = {},
  today: string,
): CalendarDeskQuery {
  const dayRaw = firstParam(raw.day);
  const laneRaw = firstParam(raw.lane).toLowerCase();
  const viewRaw = firstParam(raw.view).toLowerCase();
  const nodeRaw = firstParam(raw.node).toUpperCase();
  return {
    day: isCivilDay(dayRaw) ? dayRaw : today,
    view: viewRaw === "week" || viewRaw === "month" ? viewRaw : "day",
    lane: isCalendarLane(laneRaw) ? laneRaw : "",
    node: isCatalystNode(nodeRaw) ? nodeRaw : "",
    event: firstParam(raw.event),
  };
}

export function calendarHref(input: {
  day?: string;
  view?: CalendarView | "";
  lane?: CalendarLane | "";
  node?: CatalystNode | "";
  event?: string;
  today?: string;
}): string {
  const params = new URLSearchParams();
  if (input.day && input.day !== input.today) params.set("day", input.day);
  if (input.view && input.view !== "day") params.set("view", input.view);
  if (input.lane) params.set("lane", input.lane);
  if (input.node) params.set("node", input.node);
  if (input.event) params.set("event", input.event);
  const query = params.toString();
  return query ? `/calendar?${query}` : "/calendar";
}

export function eventVisible(
  event: CalendarEvent,
  lane: CalendarLane | "" = "",
  node: CatalystNode | "" = "",
): boolean {
  if (lane && event.lane !== lane) return false;
  if (node && event.node !== node) return false;
  return true;
}

export function eventCivilStart(event: CalendarEvent): string {
  return chicagoDay(event.start);
}

export function eventCivilEnd(event: CalendarEvent): string {
  const start = eventCivilStart(event);
  if (event.end && isCivilDay(event.end)) return event.end;
  return start;
}

function standingBriefSuppressed(
  event: CalendarEvent,
  day: string,
  events: readonly CalendarEvent[] | undefined,
): boolean {
  if (event.id !== STANDING_DAILY_BRIEF_ID) return false;
  return Boolean(events?.some((row) => row.id === dailyBriefRowId(day)));
}

export function occurrenceOnDay(
  event: CalendarEvent,
  day: string,
  events?: readonly CalendarEvent[],
): CalendarOccurrence | null {
  if (event.datePrecision === "month") return null;
  if (event.recurrence?.freq === "weekdays") {
    if (!isCivilWeekday(day)) return null;
    if (standingBriefSuppressed(event, day, events)) return null;
    const instant = chicagoInstant(day, event.recurrence.time);
    return { event, start: formatChicagoIso(instant), day };
  }
  const startDay = eventCivilStart(event);
  if (!startDay) return null;
  const endDay = eventCivilEnd(event);
  if (day < startDay || day > endDay) return null;
  const occurrence: CalendarOccurrence = { event, start: event.start, day };
  if (day !== startDay) occurrence.continues = true;
  return occurrence;
}

export function occurrencesOnDay(
  events: readonly CalendarEvent[],
  day: string,
  lane: CalendarLane | "" = "",
  node: CatalystNode | "" = "",
): CalendarOccurrence[] {
  return events
    .filter((event) => eventVisible(event, lane, node))
    .map((event) => occurrenceOnDay(event, day, events))
    .filter((item): item is CalendarOccurrence => item !== null)
    .sort((left, right) => {
      const delta = Date.parse(left.start) - Date.parse(right.start);
      if (delta !== 0) return delta;
      return left.event.id.localeCompare(right.event.id);
    });
}

export function monthLevelEvents(
  events: readonly CalendarEvent[],
  monthKey: string,
  lane: CalendarLane | "" = "",
  node: CatalystNode | "" = "",
): CalendarEvent[] {
  return events
    .filter((event) => event.datePrecision === "month" && eventVisible(event, lane, node))
    .filter((event) => {
      const start = eventCivilStart(event).slice(0, 7);
      const end = eventCivilEnd(event).slice(0, 7);
      return Boolean(start) && monthKey >= start && monthKey <= end;
    })
    .sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id));
}

function spanDays(event: CalendarEvent): number {
  const start = eventCivilStart(event);
  const end = eventCivilEnd(event);
  if (!start || !end) return 0;
  const [startYear, startMonth, startDate] = start.split("-").map(Number);
  const [endYear, endMonth, endDate] = end.split("-").map(Number);
  const delta =
    Date.UTC(endYear, endMonth - 1, endDate) -
    Date.UTC(startYear, startMonth - 1, startDate);
  return Math.max(0, Math.round(delta / 86_400_000));
}

export function chipsOnDay(
  events: readonly CalendarEvent[],
  day: string,
  lane: CalendarLane | "" = "",
  node: CatalystNode | "" = "",
): { chips: CalendarChip[]; overflow: number } {
  const ranked = [...occurrencesOnDay(events, day, lane, node)].sort((left, right) => {
    const span = spanDays(left.event) - spanDays(right.event);
    if (span !== 0) return span;
    const windowBias =
      Number(left.event.datePrecision === "window") -
      Number(right.event.datePrecision === "window");
    if (windowBias !== 0) return windowBias;
    return left.event.title.localeCompare(right.event.title);
  });
  const visible = ranked.slice(0, MONTH_CHIP_LIMIT);
  return {
    chips: visible.map((item) => ({
      id: item.event.id,
      label: item.event.node ?? (item.event.lane ? CALENDAR_LANE_CHIP[item.event.lane] : "Cad"),
      title: item.event.title,
      tone: item.event.node ?? item.event.lane ?? "cadence",
      tentative: item.event.status === "tentative",
      window: item.event.datePrecision === "window",
    })),
    overflow: Math.max(0, ranked.length - visible.length),
  };
}

export function occurrenceClock(item: CalendarOccurrence): string {
  if (item.event.datePrecision === "month") return "Month";
  if (item.event.datePrecision === "window") return "Window";
  if (item.event.allDay) return "All day";
  return formatChicagoClock(item.start);
}

export function eventWhenLabel(event: CalendarEvent): string {
  const start = eventCivilStart(event);
  const end = eventCivilEnd(event);
  if (event.datePrecision === "month") return formatCivilMonth(start);
  if (end && start && end !== start) {
    return `${formatCivilDate(start)} – ${formatCivilDate(end)}`;
  }
  if (event.allDay || event.datePrecision === "window") return formatCivilDate(start);
  return formatChicagoStamp(event.start);
}

export type CalendarWeekDay = {
  date: string;
  isToday: boolean;
  isSelected: boolean;
};

export function calendarWeekDays(day: string, today: string): CalendarWeekDay[] {
  return civilWeek(day).map((date) => ({
    date,
    isToday: date === today,
    isSelected: date === day,
  }));
}

export const CALENDAR_LANE_FILTERS = ["", ...CALENDAR_LANES] as const;

export function adjacentWeekDay(day: string, weeks: number): string {
  return addCivilDays(day, weeks * 7);
}

export function monthKeyForDay(day: string): string {
  return civilMonthKey(day);
}
