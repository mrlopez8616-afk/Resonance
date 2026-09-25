import {
  CATALYST_NODES,
  isCatalystNode,
  type CalendarEvent,
  type CatalystNode,
  type CatalystStatus,
  type DatePrecision,
} from "@/data/calendar";
import { chicagoInstant, formatChicagoIso, isCivilDay } from "@/lib/calendar-time";
import rawCatalysts from "./catalyst-events.json";

export const CATALYST_SEED_COUNT = 34;

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const EVENT_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

type RawCatalyst = {
  id?: unknown;
  node?: unknown;
  title?: unknown;
  start?: unknown;
  end?: unknown;
  time_ct?: unknown;
  location?: unknown;
  status?: unknown;
  source_url?: unknown;
  note?: unknown;
  date_precision?: unknown;
  type?: unknown;
};

function isRecord(value: unknown): value is RawCatalyst {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function assertSeed(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Catalyst seed: ${message}`);
}

/**
 * Map the committed catalyst file into calendar rows.
 * Invalid nodes, missing sources, and extra events fail closed.
 */
export function catalystEventsFromRaw(raw: unknown): CalendarEvent[] {
  assertSeed(Array.isArray(raw), "file must be an array.");
  assertSeed(raw.length === CATALYST_SEED_COUNT, `expected ${CATALYST_SEED_COUNT} events.`);

  const seen = new Set<string>();
  const events: CalendarEvent[] = [];

  for (const item of raw) {
    assertSeed(isRecord(item), "each event must be an object.");
    assertSeed(item.type === "catalyst", `${text(item.id) || "row"} must be type catalyst.`);

    const id = text(item.id);
    assertSeed(EVENT_ID.test(id), `bad id ${id}`);
    assertSeed(!seen.has(id), `duplicate id ${id}`);
    seen.add(id);

    const node = text(item.node).toUpperCase();
    assertSeed(isCatalystNode(node), `${id} has a node outside the allowed ten.`);

    const title = text(item.title);
    assertSeed(Boolean(title) && title.length <= 120, `${id} title is required.`);

    const startDay = text(item.start);
    assertSeed(isCivilDay(startDay), `${id} start must be YYYY-MM-DD.`);
    const end = text(item.end);
    if (end) assertSeed(isCivilDay(end) && end >= startDay, `${id} end is before start.`);

    const status = text(item.status).toLowerCase();
    assertSeed(
      status === "confirmed" || status === "tentative",
      `${id} status must be confirmed or tentative.`,
    );

    const sourceUrl = text(item.source_url);
    assertSeed(/^https:\/\/[^\s]+$/.test(sourceUrl), `${id} source_url must be https.`);

    const precision = text(item.date_precision);
    if (precision) {
      assertSeed(
        precision === "day" || precision === "window" || precision === "month",
        `${id} date_precision must be day, window, or month.`,
      );
    }

    const time = text(item.time_ct);
    if (time) assertSeed(CLOCK.test(time), `${id} time_ct must be HH:mm.`);
    const note = text(item.note);
    assertSeed(note.length <= 400, `${id} note is too long.`);
    const location = text(item.location);
    assertSeed(location.length <= 80, `${id} location is too long.`);

    const event: CalendarEvent = {
      id,
      kind: "catalyst",
      node: node as CatalystNode,
      start: formatChicagoIso(chicagoInstant(startDay, time || "00:00")),
      title,
      status: status as CatalystStatus,
      writer: "agent",
      sourceUrl,
      ...(end ? { end } : {}),
      ...(note ? { note } : {}),
      ...(location ? { location } : {}),
      ...(precision ? { datePrecision: precision as DatePrecision } : {}),
      ...(time ? {} : { allDay: true }),
    };
    events.push(event);
  }

  const used = new Set(events.map((event) => event.node));
  for (const node of CATALYST_NODES) {
    assertSeed(used.has(node), `seed is missing node ${node}.`);
  }

  return events;
}

export const catalystSeed: CalendarEvent[] = catalystEventsFromRaw(rawCatalysts);
