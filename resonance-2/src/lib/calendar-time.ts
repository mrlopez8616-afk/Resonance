import { CALENDAR_TIME_ZONE } from "@/data/calendar";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  const existing = partFormatters.get(timeZone);
  if (existing) return existing;
  const created = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  partFormatters.set(timeZone, created);
  return created;
}

function zonedParts(timeZone: string, date: Date): ZonedParts {
  const parts = formatter(timeZone).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  let hour = read("hour");
  if (hour === 24) hour = 0;
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour,
    minute: read("minute"),
    second: read("second"),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function offsetMinutes(timeZone: string, utcMs: number): number {
  const parts = zonedParts(timeZone, new Date(utcMs));
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((asUtc - utcMs) / 60_000);
}

export function isCivilDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

/** Weekday of a civil YYYY-MM-DD. Sunday is 0. */
export function civilWeekday(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay();
}

export function isCivilWeekday(day: string): boolean {
  const weekday = civilWeekday(day);
  return weekday >= 1 && weekday <= 5;
}

export function civilWeekdayShort(day: string): string {
  return WEEKDAY_SHORT[civilWeekday(day)] ?? "";
}

export function civilWeekdayLong(day: string): string {
  return WEEKDAY_LONG[civilWeekday(day)] ?? "";
}

export function formatCivilDate(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return `${date} ${MONTHS[month - 1] ?? ""} ${year}`;
}

export function addCivilDays(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date + delta));
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

/** Monday–Sunday civil dates containing `day`. */
export function civilWeek(day: string): string[] {
  const offset = (civilWeekday(day) + 6) % 7;
  const monday = addCivilDays(day, -offset);
  return Array.from({ length: 7 }, (_, index) => addCivilDays(monday, index));
}

export function chicagoToday(now = new Date()): string {
  const parts = zonedParts(CALENDAR_TIME_ZONE, now);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** America/Chicago civil date of an ISO instant. */
export function chicagoDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = zonedParts(CALENDAR_TIME_ZONE, date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** Instant for a America/Chicago wall-clock time on a civil date. */
export function chicagoInstant(day: string, time: string): Date {
  const match = CLOCK.exec(time);
  const hour = match ? Number(match[1]) : 0;
  const minute = match ? Number(match[2]) : 0;
  const [year, month, date] = day.split("-").map(Number);
  const wallAsUtc = Date.UTC(year, month - 1, date, hour, minute, 0);
  const firstOffset = offsetMinutes(CALENDAR_TIME_ZONE, wallAsUtc);
  let utc = wallAsUtc - firstOffset * 60_000;
  const secondOffset = offsetMinutes(CALENDAR_TIME_ZONE, utc);
  if (secondOffset !== firstOffset) {
    utc = wallAsUtc - secondOffset * 60_000;
  }
  return new Date(utc);
}

export function formatChicagoIso(date: Date): string {
  const parts = zonedParts(CALENDAR_TIME_ZONE, date);
  const offset = offsetMinutes(CALENDAR_TIME_ZONE, date.getTime());
  const sign = offset >= 0 ? "+" : "-";
  const absolute = Math.abs(offset);
  const hours = pad(Math.floor(absolute / 60));
  const minutes = pad(absolute % 60);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}${sign}${hours}:${minutes}`;
}

/** Desk clock, e.g. `7:00 AM CT`. */
export function formatChicagoClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = zonedParts(CALENDAR_TIME_ZONE, date);
  const suffix = parts.hour >= 12 ? "PM" : "AM";
  const hour12 = parts.hour % 12 || 12;
  return `${hour12}:${pad(parts.minute)} ${suffix} CT`;
}

/** Detail stamp with the Chicago offset preserved. */
export function formatChicagoStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return formatChicagoIso(date).replace("T", " ");
}
