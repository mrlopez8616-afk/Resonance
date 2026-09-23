import type { CalendarEvent, CalendarLane } from "@/data/calendar";
import { CALENDAR_LANES } from "@/data/calendar";
import {
  addCivilDays,
  chicagoDay,
  chicagoInstant,
  civilWeek,
  formatChicagoIso,
  isCivilDay,
  isCivilWeekday,
} from "@/lib/calendar-time";
import { isCalendarLane } from "@/lib/calendar-event";

export type CalendarOccurrence = {
  event: CalendarEvent;
  /** Instant of this occurrence, ISO-8601. */
  start: string;
  day: string;
};

export type CalendarDeskQuery = {
  day: string;
  lane: CalendarLane | "";
  event: string;
};

type RawParam = string | string[] | undefined;

export type CalendarDeskSearch = {
  day?: RawParam;
  lane?: RawParam;
  event?: RawParam;
};

function firstParam(value: RawParam): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

export function parseCalendarDeskQuery(
  raw: CalendarDeskSearch = {},
  today: string,
): CalendarDeskQuery {
  const dayRaw = firstParam(raw.day);
  const laneRaw = firstParam(raw.lane).toLowerCase();
  return {
    day: isCivilDay(dayRaw) ? dayRaw : today,
    lane: isCalendarLane(laneRaw) ? laneRaw : "",
    event: firstParam(raw.event),
  };
}

export function calendarHref(input: {
  day?: string;
  lane?: CalendarLane | "";
  event?: string;
  today?: string;
}): string {
  const params = new URLSearchParams();
  if (input.day && input.day !== input.today) params.set("day", input.day);
  if (input.lane) params.set("lane", input.lane);
  if (input.event) params.set("event", input.event);
  const query = params.toString();
  return query ? `/calendar?${query}` : "/calendar";
}

export function occurrenceOnDay(
  event: CalendarEvent,
  day: string,
): CalendarOccurrence | null {
  if (event.recurrence?.freq === "weekdays") {
    if (!isCivilWeekday(day)) return null;
    const instant = chicagoInstant(day, event.recurrence.time);
    return { event, start: formatChicagoIso(instant), day };
  }
  if (chicagoDay(event.start) !== day) return null;
  return { event, start: event.start, day };
}

export function occurrencesOnDay(
  events: readonly CalendarEvent[],
  day: string,
  lane: CalendarLane | "" = "",
): CalendarOccurrence[] {
  return events
    .filter((event) => !lane || event.lane === lane)
    .map((event) => occurrenceOnDay(event, day))
    .filter((item): item is CalendarOccurrence => item !== null)
    .sort((left, right) => {
      const delta = Date.parse(left.start) - Date.parse(right.start);
      if (delta !== 0) return delta;
      return left.event.id.localeCompare(right.event.id);
    });
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
