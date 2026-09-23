import { calendarSeed, type CalendarEvent } from "@/data/calendar";
import {
  CalendarWriteError,
  isCalendarLane,
  isCalendarStatus,
  isCalendarWriter,
} from "@/lib/calendar-event";

export const CALENDAR_STORE_VERSION = 1;
export const CALENDAR_BLOB_PATH = "resonance-2/calendar.json";
export const DEFAULT_CALENDAR_FILE = ".data/calendar.json";

export type CalendarStoreBackend = "blob" | "file" | "none";
export type EnvLike = Record<string, string | undefined>;

export interface CalendarStoreEnvelope {
  version: typeof CALENDAR_STORE_VERSION;
  updatedAt: string;
  seededAt: string | null;
  events: CalendarEvent[];
}

export function detectCalendarBackend(
  env: EnvLike = process.env,
): CalendarStoreBackend {
  if (env.BLOB_READ_WRITE_TOKEN?.trim()) return "blob";
  if (env.RESONANCE_CALENDAR_FILE?.trim()) return "file";
  if (env.VERCEL) return "none";
  return "file";
}

export function isCalendarStoreConfigured(
  env: EnvLike = process.env,
): boolean {
  return detectCalendarBackend(env) !== "none";
}

export function createEmptyCalendarEnvelope(
  now = new Date().toISOString(),
): CalendarStoreEnvelope {
  return {
    version: CALENDAR_STORE_VERSION,
    updatedAt: now,
    seededAt: null,
    events: [],
  };
}

export function createSeededCalendarEnvelope(
  now = new Date().toISOString(),
): CalendarStoreEnvelope {
  return {
    version: CALENDAR_STORE_VERSION,
    updatedAt: now,
    seededAt: now,
    events: calendarSeed.map((row) => ({
      ...row,
      recurrence: row.recurrence ? { ...row.recurrence } : undefined,
    })),
  };
}

export function ensureSeededCalendarEnvelope(
  current: CalendarStoreEnvelope | null,
  now = new Date().toISOString(),
): { envelope: CalendarStoreEnvelope; seeded: boolean } {
  if (!current || current.events.length === 0) {
    return { envelope: createSeededCalendarEnvelope(now), seeded: true };
  }
  return { envelope: current, seeded: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recurrenceKey(recurrence: CalendarEvent["recurrence"]): string {
  if (!recurrence) return "";
  return `${recurrence.freq}|${recurrence.timeZone}|${recurrence.time}`;
}

export function calendarEventsMatch(left: CalendarEvent, right: CalendarEvent): boolean {
  return (
    left.id === right.id &&
    left.lane === right.lane &&
    left.start === right.start &&
    left.title === right.title &&
    left.status === right.status &&
    left.writer === right.writer &&
    (left.link ?? "") === (right.link ?? "") &&
    (left.note ?? "") === (right.note ?? "") &&
    recurrenceKey(left.recurrence) === recurrenceKey(right.recurrence)
  );
}

function coerceRecurrence(raw: unknown): CalendarEvent["recurrence"] | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw.freq !== "weekdays" || raw.timeZone !== "America/Chicago") return undefined;
  if (typeof raw.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time)) {
    return undefined;
  }
  return { freq: "weekdays", timeZone: "America/Chicago", time: raw.time };
}

function coerceStoredEvent(raw: unknown): CalendarEvent | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(raw.id)) {
    return null;
  }
  if (typeof raw.lane !== "string" || !isCalendarLane(raw.lane)) return null;
  if (typeof raw.start !== "string" || Number.isNaN(Date.parse(raw.start))) return null;
  if (typeof raw.title !== "string" || !raw.title.trim()) return null;
  if (typeof raw.status !== "string" || !isCalendarStatus(raw.status)) return null;
  if (typeof raw.writer !== "string" || !isCalendarWriter(raw.writer)) return null;
  if (raw.lane === "gates" && raw.writer === "agent") return null;
  const event: CalendarEvent = {
    id: raw.id,
    lane: raw.lane,
    start: raw.start,
    title: raw.title.trim(),
    status: raw.status,
    writer: raw.writer,
  };
  if (typeof raw.link === "string" && raw.link.trim()) event.link = raw.link.trim();
  if (typeof raw.note === "string" && raw.note.trim()) event.note = raw.note.trim();
  if (raw.lane === "cadence") {
    const recurrence = coerceRecurrence(raw.recurrence);
    if (recurrence) event.recurrence = recurrence;
  }
  return event;
}

export function parseCalendarEnvelope(raw: unknown): CalendarStoreEnvelope | null {
  if (!isRecord(raw) || !Array.isArray(raw.events)) return null;
  const events = raw.events
    .map((item) => coerceStoredEvent(item))
    .filter((item): item is CalendarEvent => item !== null);
  return {
    version: CALENDAR_STORE_VERSION,
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt
        ? raw.updatedAt
        : new Date().toISOString(),
    seededAt: typeof raw.seededAt === "string" ? raw.seededAt : null,
    events,
  };
}

export function listCalendarEvents(events: readonly CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((left, right) => {
    const delta = Date.parse(left.start) - Date.parse(right.start);
    if (delta !== 0) return delta;
    return left.id.localeCompare(right.id);
  });
}

export function writeCalendarEventIntoEnvelope(
  envelope: CalendarStoreEnvelope,
  event: CalendarEvent,
  now = new Date().toISOString(),
): {
  envelope: CalendarStoreEnvelope;
  event: CalendarEvent;
  deduped: boolean;
  updated: boolean;
} {
  const index = envelope.events.findIndex((row) => row.id === event.id);
  if (index === -1) {
    return {
      envelope: {
        ...envelope,
        updatedAt: now,
        events: [...envelope.events, event],
      },
      event,
      deduped: false,
      updated: false,
    };
  }

  const existing = envelope.events[index];
  if (!existing) {
    throw new CalendarWriteError("Calendar event was missing.");
  }
  if (existing.lane !== event.lane) {
    throw new CalendarWriteError("lane is fixed once an event id exists.");
  }
  if (existing.writer !== event.writer) {
    throw new CalendarWriteError("writer is fixed once an event id exists.");
  }
  if (calendarEventsMatch(existing, event)) {
    return { envelope, event: existing, deduped: true, updated: false };
  }

  const next = envelope.events.slice();
  next[index] = event;
  return {
    envelope: { ...envelope, updatedAt: now, events: next },
    event,
    deduped: false,
    updated: true,
  };
}
