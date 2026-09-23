import {
  CALENDAR_LANES,
  CALENDAR_STATUSES,
  CALENDAR_TIME_ZONE,
  CALENDAR_WRITERS,
  type CalendarEvent,
  type CalendarLane,
  type CalendarRecurrence,
  type CalendarStatus,
  type CalendarWriter,
} from "@/data/calendar";

export class CalendarWriteError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CalendarWriteError";
    this.status = status;
  }
}

const ISO_ZONED =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const EVENT_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isCalendarLane(value: string): value is CalendarLane {
  return (CALENDAR_LANES as readonly string[]).includes(value);
}

export function isCalendarStatus(value: string): value is CalendarStatus {
  return (CALENDAR_STATUSES as readonly string[]).includes(value);
}

export function isCalendarWriter(value: string): value is CalendarWriter {
  return (CALENDAR_WRITERS as readonly string[]).includes(value);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function calendarEventId(input: {
  id?: string;
  lane: CalendarLane;
  start: string;
  title: string;
}): string {
  const provided = input.id?.trim().toLowerCase() ?? "";
  if (provided) {
    if (!EVENT_ID.test(provided)) {
      throw new CalendarWriteError(
        "id must be a lowercase slug (letters, numbers, hyphens).",
      );
    }
    return provided;
  }
  const generated = `${input.lane}-${slug(input.start)}-${slug(input.title)}`
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/g, "");
  if (!EVENT_ID.test(generated)) {
    throw new CalendarWriteError("Could not derive an event id.");
  }
  return generated;
}

function readLink(value: string): string | undefined {
  if (!value) return undefined;
  if (value.length > 500 || /\s/.test(value)) {
    throw new CalendarWriteError("link must be a site path or https URL.");
  }
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) {
    return value;
  }
  if (/^https:\/\/[^\s]+$/.test(value)) return value;
  throw new CalendarWriteError("link must be a site path or https URL.");
}

function readRecurrence(
  raw: unknown,
  lane: CalendarLane,
): CalendarRecurrence | undefined {
  if (raw == null) return undefined;
  if (lane !== "cadence") {
    throw new CalendarWriteError("recurrence is only for the cadence lane.");
  }
  if (!isRecord(raw) || raw.freq !== "weekdays") {
    throw new CalendarWriteError('recurrence.freq must be "weekdays".');
  }
  if (raw.timeZone !== CALENDAR_TIME_ZONE) {
    throw new CalendarWriteError("recurrence.timeZone must be America/Chicago.");
  }
  const time = asTrimmed(raw.time);
  if (!CLOCK.test(time)) {
    throw new CalendarWriteError("recurrence.time must be HH:mm.");
  }
  return { freq: "weekdays", timeZone: CALENDAR_TIME_ZONE, time };
}

export function extractCalendarBody(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) {
    throw new CalendarWriteError("JSON object is required.");
  }
  if (isRecord(body.event)) return body.event;
  return body;
}

export function parseCalendarEvent(body: unknown): CalendarEvent {
  const raw = extractCalendarBody(body);
  const lane = asTrimmed(raw.lane).toLowerCase();
  if (!isCalendarLane(lane)) {
    throw new CalendarWriteError(
      "lane must be cadence, capital, build, or gates.",
    );
  }

  const writer = asTrimmed(raw.writer).toLowerCase();
  if (!isCalendarWriter(writer)) {
    throw new CalendarWriteError("writer must be agent or founder.");
  }
  if (lane === "gates" && writer === "agent") {
    throw new CalendarWriteError(
      "Gates are human approvals. Send writer founder.",
    );
  }

  const start = asTrimmed(raw.start);
  if (!ISO_ZONED.test(start) || Number.isNaN(Date.parse(start))) {
    throw new CalendarWriteError(
      "start must be an ISO-8601 timestamp with an offset or Z.",
    );
  }

  const title = asTrimmed(raw.title);
  if (!title || title.length > 120) {
    throw new CalendarWriteError("title is required (120 characters max).");
  }

  const status = asTrimmed(raw.status).toLowerCase();
  if (!isCalendarStatus(status)) {
    throw new CalendarWriteError(
      "status must be scheduled, history, pending, awaiting, merged, or open.",
    );
  }

  const note = asTrimmed(raw.note);
  if (note.length > 400) {
    throw new CalendarWriteError("note must be 400 characters or fewer.");
  }

  const event: CalendarEvent = {
    id: calendarEventId({
      id: asTrimmed(raw.id),
      lane,
      start,
      title,
    }),
    lane,
    start,
    title,
    status,
    writer,
    link: readLink(asTrimmed(raw.link)),
    note: note || undefined,
    recurrence: readRecurrence(raw.recurrence, lane),
  };
  return event;
}
