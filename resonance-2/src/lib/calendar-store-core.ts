import { catalystSeed } from "@/data/catalyst-seed";
import { fightCalendar } from "@/data/fight-calendar";
import {
  calendarSeed,
  isCatalystNode,
  type CalendarEvent,
  type CatalystStatus,
  type DatePrecision,
} from "@/data/calendar";
import {
  CalendarWriteError,
  isCalendarLane,
  isCalendarStatus,
  isCalendarWriter,
  parseCalendarEvent,
} from "@/lib/calendar-event";
import { chicagoDay, isCivilDay } from "@/lib/calendar-time";
import {
  BUCKLEY_EVENT_SLUG,
  canonicalEventSlug,
  isEdmontonAlias,
  sameHeadlinerOrVenue,
} from "@/lib/fight-event-alias";
import { dailyBriefBackfillBodies } from "@/lib/calendar-writers";
import { detectStoreBackend, type EnvLike, type StoreBackendName } from "@/lib/store-backend";

export const CALENDAR_STORE_VERSION = 1;
export const CALENDAR_BLOB_PATH = "resonance-2/calendar.json";
export const DEFAULT_CALENDAR_FILE = ".data/calendar.json";

export type CalendarStoreBackend = StoreBackendName;
export type { EnvLike };

export interface CalendarStoreEnvelope {
  version: typeof CALENDAR_STORE_VERSION;
  updatedAt: string;
  seededAt: string | null;
  events: CalendarEvent[];
}

export function detectCalendarBackend(env: EnvLike = process.env): CalendarStoreBackend {
  return detectStoreBackend(env, "RESONANCE_CALENDAR_FILE");
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

export function calendarCatalog(): CalendarEvent[] {
  return [...calendarSeed, ...catalystSeed, ...fightCalendar].map(cloneCalendarEvent);
}

function cloneCalendarEvent(row: CalendarEvent): CalendarEvent {
  return {
    ...row,
    recurrence: row.recurrence ? { ...row.recurrence } : undefined,
  };
}

export function createSeededCalendarEnvelope(
  now = new Date().toISOString(),
): CalendarStoreEnvelope {
  return {
    version: CALENDAR_STORE_VERSION,
    updatedAt: now,
    seededAt: now,
    events: calendarCatalog(),
  };
}

/**
 * Insert a Daily Brief only when that id is absent.
 * A hub row with the same id keeps its title, start, status, and note.
 */
export function insertMissingDailyBriefs(
  envelope: CalendarStoreEnvelope,
  now = new Date().toISOString(),
): { envelope: CalendarStoreEnvelope; inserted: boolean } {
  const clock = new Date(now);
  const when = Number.isNaN(clock.getTime()) ? new Date() : clock;
  let next = envelope;
  let inserted = false;
  for (const body of dailyBriefBackfillBodies(when)) {
    const event = parseCalendarEvent(body);
    if (next.events.some((row) => row.id === event.id)) continue;
    const written = writeCalendarEventIntoEnvelope(next, event, now);
    next = written.envelope;
    inserted = true;
  }
  return { envelope: next, inserted };
}

/**
 * Upsert the committed catalog by id.
 * Same id + same body is a no-op. Same id + changed body updates.
 * Rows that are not in the catalog (fills, briefs, pull requests) stay.
 * Missing Sep 28 and Sep 29 Daily Briefs are inserted and never overwritten.
 */
export function ensureSeededCalendarEnvelope(
  current: CalendarStoreEnvelope | null,
  now = new Date().toISOString(),
): { envelope: CalendarStoreEnvelope; seeded: boolean } {
  let envelope = current ?? createEmptyCalendarEnvelope(now);
  let seeded = !current || current.events.length === 0;
  for (const row of calendarCatalog()) {
    const written = writeCalendarEventIntoEnvelope(envelope, row, now);
    if (!written.deduped) {
      envelope = written.envelope;
      seeded = true;
    }
  }
  const briefs = insertMissingDailyBriefs(envelope, now);
  envelope = briefs.envelope;
  if (briefs.inserted) seeded = true;
  if (seeded && !envelope.seededAt) {
    envelope = { ...envelope, seededAt: now };
  }
  return { envelope, seeded };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recurrenceKey(recurrence: CalendarEvent["recurrence"]): string {
  if (!recurrence) return "";
  return `${recurrence.freq}|${recurrence.timeZone}|${recurrence.time}`;
}

function optionalText(value: string | undefined): string {
  return value ?? "";
}

export function calendarEventsMatch(left: CalendarEvent, right: CalendarEvent): boolean {
  return (
    left.id === right.id &&
    (left.kind ?? "") === (right.kind ?? "") &&
    (left.lane ?? "") === (right.lane ?? "") &&
    (left.node ?? "") === (right.node ?? "") &&
    left.start === right.start &&
    optionalText(left.end) === optionalText(right.end) &&
    left.title === right.title &&
    left.status === right.status &&
    left.writer === right.writer &&
    optionalText(left.link) === optionalText(right.link) &&
    optionalText(left.sourceUrl) === optionalText(right.sourceUrl) &&
    optionalText(left.eventSlug) === optionalText(right.eventSlug) &&
    optionalText(left.note) === optionalText(right.note) &&
    optionalText(left.location) === optionalText(right.location) &&
    (left.datePrecision ?? "") === (right.datePrecision ?? "") &&
    Boolean(left.allDay) === Boolean(right.allDay) &&
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

function readStoredHttps(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 500 || /\s/.test(trimmed)) return undefined;
  if (!/^https:\/\/[^\s]+$/.test(trimmed)) return undefined;
  return trimmed;
}

function readStoredCivil(value: unknown): string | undefined {
  if (typeof value !== "string" || !isCivilDay(value)) return undefined;
  return value;
}

function readStoredSlug(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return undefined;
  return slug;
}

function readStoredPrecision(value: unknown): DatePrecision | undefined {
  if (value === "day" || value === "window" || value === "month") return value;
  return undefined;
}

function coerceCatalyst(raw: Record<string, unknown>): CalendarEvent | null {
  if (typeof raw.node !== "string" || !isCatalystNode(raw.node)) return null;
  if (raw.status !== "confirmed" && raw.status !== "tentative") return null;
  const sourceUrl = readStoredHttps(raw.sourceUrl ?? raw.source_url);
  if (!sourceUrl) return null;
  const event: CalendarEvent = {
    id: raw.id as string,
    kind: "catalyst",
    node: raw.node,
    start: raw.start as string,
    title: (raw.title as string).trim(),
    status: raw.status as CatalystStatus,
    writer: raw.writer as CalendarEvent["writer"],
    sourceUrl,
  };
  const end = readStoredCivil(raw.end);
  if (end) event.end = end;
  if (typeof raw.link === "string" && raw.link.trim()) event.link = raw.link.trim();
  if (typeof raw.note === "string" && raw.note.trim()) event.note = raw.note.trim();
  if (typeof raw.location === "string" && raw.location.trim()) {
    event.location = raw.location.trim().slice(0, 80);
  }
  const precision = readStoredPrecision(raw.datePrecision ?? raw.date_precision);
  if (precision) event.datePrecision = precision;
  if (raw.allDay === true) event.allDay = true;
  return event;
}

function coerceFight(raw: Record<string, unknown>): CalendarEvent | null {
  if (typeof raw.status !== "string" || !isCalendarStatus(raw.status)) return null;
  if (raw.lane != null || raw.node != null) return null;
  const event: CalendarEvent = {
    id: raw.id as string,
    kind: "fight",
    start: raw.start as string,
    title: (raw.title as string).trim(),
    status: raw.status,
    writer: raw.writer as CalendarEvent["writer"],
  };
  if (typeof raw.link === "string" && raw.link.trim()) event.link = raw.link.trim();
  const eventSlug = readStoredSlug(raw.eventSlug ?? raw.event_slug);
  if (eventSlug) event.eventSlug = eventSlug;
  if (typeof raw.note === "string" && raw.note.trim()) event.note = raw.note.trim();
  if (typeof raw.location === "string" && raw.location.trim()) {
    event.location = raw.location.trim().slice(0, 80);
  }
  return event;
}

function coerceStoredEvent(raw: unknown): CalendarEvent | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(raw.id)) {
    return null;
  }
  if (typeof raw.start !== "string" || Number.isNaN(Date.parse(raw.start))) return null;
  if (typeof raw.title !== "string" || !raw.title.trim()) return null;
  if (typeof raw.writer !== "string" || !isCalendarWriter(raw.writer)) return null;
  if (raw.kind === "catalyst") return coerceCatalyst(raw);
  if (raw.kind === "fight") return coerceFight(raw);
  if (raw.kind) return null;
  if (typeof raw.lane !== "string" || !isCalendarLane(raw.lane)) return null;
  if (typeof raw.status !== "string" || !isCalendarStatus(raw.status)) return null;
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
  const eventSlug = readStoredSlug(raw.eventSlug ?? raw.event_slug);
  if (eventSlug) event.eventSlug = eventSlug;
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

const SESSION_IN_TITLE = /\b(?:early[\s-]*prelims?|main[\s-]*card|prelims?)\b/i;
const NUMBERED_UFC = /\bufc\s+\d+\b/i;

function isFightCalendarRow(event: CalendarEvent): boolean {
  return event.kind === "fight" || event.lane === "fights";
}

/** Numbered UFC cards share one key. Other titles keep the bout and drop the session words. */
function fightCardKey(title: string): string {
  const numbered = NUMBERED_UFC.exec(title);
  if (numbered?.[0]) return numbered[0].toLowerCase().replace(/\s+/g, " ");
  return title
    .toLowerCase()
    .replace(new RegExp(SESSION_IN_TITLE.source, "gi"), " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fightSession(title: string): string {
  const match = SESSION_IN_TITLE.exec(title);
  if (!match?.[0]) return "";
  const word = match[0].toLowerCase();
  if (word.startsWith("early")) return "early-prelims";
  if (word.startsWith("main")) return "main-card";
  return "prelims";
}

function sameFightCard(left: CalendarEvent, right: CalendarEvent): boolean {
  if (!isFightCalendarRow(left) || !isFightCalendarRow(right)) return false;
  const key = fightCardKey(left.title);
  if (!key || key !== fightCardKey(right.title)) return false;
  if (chicagoDay(left.start) !== chicagoDay(right.start)) return false;
  const leftSession = fightSession(left.title);
  const rightSession = fightSession(right.title);
  return !leftSession || !rightSession || leftSession === rightSession;
}

function fillFromSlugless(target: CalendarEvent, extra: CalendarEvent): CalendarEvent {
  const next: CalendarEvent = { ...target };
  if (!next.location && extra.location) next.location = extra.location;
  if (!next.link && extra.link) next.link = extra.link;
  if (!next.sourceUrl && extra.sourceUrl) next.sourceUrl = extra.sourceUrl;
  if (!next.end && extra.end) next.end = extra.end;
  if (extra.note && extra.note !== next.note && !next.note?.includes(extra.note)) {
    next.note = next.note ? `${next.note} · ${extra.note}` : extra.note;
  }
  return next;
}

/**
 * Read-time only. A fight row with no eventSlug that matches a slugged row
 * for the same card and day is folded into that row. Stored rows stay.
 */
export function dedupeSluglessFightEvents(events: readonly CalendarEvent[]): CalendarEvent[] {
  const slugged = events.filter((event) => isFightCalendarRow(event) && event.eventSlug?.trim());
  const slugless = events.filter((event) => isFightCalendarRow(event) && !event.eventSlug?.trim());
  const pairs: { slugless: CalendarEvent; slugged: CalendarEvent; score: number }[] = [];
  for (const bare of slugless) {
    for (const tagged of slugged) {
      if (!sameFightCard(bare, tagged)) continue;
      let score = 0;
      if (fightSession(bare.title) && fightSession(bare.title) === fightSession(tagged.title)) score += 1000;
      if (bare.title.trim().toLowerCase() === tagged.title.trim().toLowerCase()) score += 100;
      const delta = Math.abs(Date.parse(bare.start) - Date.parse(tagged.start));
      if (Number.isFinite(delta)) score -= Math.min(delta / 60_000, 500);
      pairs.push({ slugless: bare, slugged: tagged, score });
    }
  }
  pairs.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    const titles = left.slugless.id.localeCompare(right.slugless.id);
    if (titles !== 0) return titles;
    return left.slugged.id.localeCompare(right.slugged.id);
  });
  const usedBare = new Set<string>();
  const usedTagged = new Set<string>();
  const folded = new Map<string, CalendarEvent>();
  for (const pair of pairs) {
    if (usedBare.has(pair.slugless.id) || usedTagged.has(pair.slugged.id)) continue;
    usedBare.add(pair.slugless.id);
    usedTagged.add(pair.slugged.id);
    const current = folded.get(pair.slugged.id) ?? pair.slugged;
    folded.set(pair.slugged.id, fillFromSlugless(current, pair.slugless));
  }
  return events
    .filter((event) => !usedBare.has(event.id))
    .map((event) => folded.get(event.id) ?? event);
}

function sameSlugSessions(left: CalendarEvent, right: CalendarEvent): boolean {
  const leftSlug = left.eventSlug?.trim().toLowerCase() ?? "";
  const rightSlug = right.eventSlug?.trim().toLowerCase() ?? "";
  if (!leftSlug || leftSlug !== rightSlug) return false;
  const key = fightCardKey(left.title);
  if (!key || key !== fightCardKey(right.title)) return false;
  if (NUMBERED_UFC.test(left.title) && NUMBERED_UFC.test(right.title)) return true;
  return Boolean(fightSession(left.title) && fightSession(right.title));
}

function sameAliasedCard(left: CalendarEvent, right: CalendarEvent): boolean {
  if (!isFightCalendarRow(left) || !isFightCalendarRow(right)) return false;
  if (sameSlugSessions(left, right)) return false;
  const day = chicagoDay(left.start);
  if (!isCivilDay(day) || day !== chicagoDay(right.start)) return false;
  const leftSlug = left.eventSlug?.trim() ?? "";
  const rightSlug = right.eventSlug?.trim() ?? "";
  const leftCanon = leftSlug ? canonicalEventSlug(leftSlug) : "";
  const rightCanon = rightSlug ? canonicalEventSlug(rightSlug) : "";
  if (leftCanon && rightCanon && leftCanon === rightCanon) return true;
  const leftAlias = isEdmontonAlias(left.title) || isEdmontonAlias(leftSlug);
  const rightAlias = isEdmontonAlias(right.title) || isEdmontonAlias(rightSlug);
  if (leftAlias || rightAlias) {
    const namesBuckley =
      leftCanon === BUCKLEY_EVENT_SLUG ||
      rightCanon === BUCKLEY_EVENT_SLUG ||
      left.title.toLowerCase().includes("buckley") ||
      right.title.toLowerCase().includes("buckley");
    if (namesBuckley || (leftAlias && rightAlias)) return true;
  }
  return sameHeadlinerOrVenue(
    { title: left.title, place: left.location },
    { title: right.title, place: right.location },
  );
}

function preferCalendarHost(left: CalendarEvent, right: CalendarEvent): CalendarEvent {
  const score = (event: CalendarEvent) => {
    let rank = 0;
    if (/\svs\.?\s/i.test(event.title)) rank += 4;
    if (event.eventSlug?.trim() && !isEdmontonAlias(event.eventSlug) && !isEdmontonAlias(event.title)) rank += 2;
    return rank;
  };
  const leftScore = score(left);
  const rightScore = score(right);
  if (leftScore !== rightScore) return leftScore > rightScore ? left : right;
  return left.id <= right.id ? left : right;
}

/**
 * Read-time only. An Edmonton alias, or the same day and headliner, folds into the canonical row.
 * Two session rows that already share one slug stay. Stored rows stay.
 */
export function dedupeAliasedFightEvents(events: readonly CalendarEvent[]): CalendarEvent[] {
  const fights = events.filter(isFightCalendarRow);
  const folded = new Map<string, CalendarEvent>();
  const dropped = new Set<string>();
  for (let index = 0; index < fights.length; index += 1) {
    for (let other = index + 1; other < fights.length; other += 1) {
      const left = fights[index];
      const right = fights[other];
      if (!left || !right || dropped.has(left.id) || dropped.has(right.id)) continue;
      const currentLeft = folded.get(left.id) ?? left;
      const currentRight = folded.get(right.id) ?? right;
      if (!sameAliasedCard(currentLeft, currentRight)) continue;
      const host = preferCalendarHost(currentLeft, currentRight);
      const guest = host === currentLeft ? currentRight : currentLeft;
      const base = folded.get(host.id) ?? host;
      folded.set(host.id, fillFromSlugless(base, guest));
      dropped.add(guest.id);
      folded.delete(guest.id);
    }
  }
  return events.filter((event) => !dropped.has(event.id)).map((event) => folded.get(event.id) ?? event);
}

/** Slugless UFC copies first, then alias and same-day headliner copies. */
export function dedupeFightCalendarEvents(events: readonly CalendarEvent[]): CalendarEvent[] {
  return dedupeAliasedFightEvents(dedupeSluglessFightEvents(events));
}

export function listCalendarEvents(events: readonly CalendarEvent[]): CalendarEvent[] {
  return dedupeFightCalendarEvents(events).sort((left, right) => {
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
  if ((existing.kind ?? "") !== (event.kind ?? "")) {
    throw new CalendarWriteError("kind is fixed once an event id exists.");
  }
  if (existing.kind === "catalyst") {
    if (existing.node !== event.node) {
      throw new CalendarWriteError("node is fixed once an event id exists.");
    }
  } else if (existing.kind === "fight") {
    if (event.lane || event.node) {
      throw new CalendarWriteError("fight rows are not lanes or nodes.");
    }
  } else if (existing.lane !== event.lane) {
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
