import type { Fill } from "@/data/fills";
import { fillCalendarDate, fillDeskHref } from "@/lib/fill-desk";
import {
  chicagoInstant,
  formatChicagoIso,
  isCivilDay,
  isCivilWeekday,
} from "@/lib/calendar-time";

const ISO_ZONED =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const EVENT_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function slugCalendarId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function capitalFillEventId(fillKey: string): string {
  const id = `capital-fill-${slugCalendarId(fillKey)}`.slice(0, 80).replace(/-+$/g, "");
  if (!EVENT_ID.test(id)) {
    throw new Error("Could not derive a capital calendar id.");
  }
  return id;
}

export function zonedTimestamp(value: string): string {
  if (ISO_ZONED.test(value) && !Number.isNaN(Date.parse(value))) return value;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error("timestamp must be ISO-8601.");
  return new Date(parsed).toISOString();
}

/** Capital row for one RH or Coinbase fill. Id is stable for the fill key. */
export function capitalCalendarBody(fill: Fill): Record<string, unknown> {
  const key = fill.idempotencyKey?.trim() || `${fill.venue ?? "fill"}:${fill.orderId}`;
  const day = fillCalendarDate(fill.time);
  const ticker = fill.symbol.trim().toUpperCase();
  const title = `${ticker} ${fill.side} ${fill.quantity}`.replace(/\s+/g, " ").trim().slice(0, 120);
  const note = [fill.venue, fill.sleeve].filter(Boolean).join(" · ");
  return {
    id: capitalFillEventId(key),
    lane: "capital",
    writer: "agent",
    start: zonedTimestamp(fill.time),
    title,
    status: "history",
    link: fillDeskHref({
      ticker,
      ...(day ? { from: day, to: day } : {}),
    }),
    ...(note ? { note } : {}),
  };
}

export function dailyBriefEventId(day: string): string {
  return `cadence-daily-brief-${day}`;
}

/**
 * One weekday Daily Brief row. The external brief POSTs this body.
 * Same id on a later call updates the row; it does not insert a second one.
 */
export function dailyBriefCalendarBody(
  day: string,
  options: { note?: string; link?: string } = {},
): Record<string, unknown> {
  if (!isCivilDay(day)) throw new Error("day must be YYYY-MM-DD.");
  if (!isCivilWeekday(day)) throw new Error("Daily Brief rows are weekdays.");
  const note = options.note?.trim().slice(0, 400) ?? "";
  const link = options.link?.trim() ?? "";
  return {
    id: dailyBriefEventId(day),
    lane: "cadence",
    writer: "agent",
    start: formatChicagoIso(chicagoInstant(day, "07:00")),
    title: "Daily Brief",
    status: "scheduled",
    ...(note ? { note } : {}),
    ...(link ? { link } : {}),
  };
}

export function buildPrEventId(number: number): string {
  return `build-pr-${number}`;
}

export function buildPrStatus(
  action: string,
  merged: boolean,
): "pending" | "awaiting" | "merged" | "history" {
  if (action === "ready_for_review") return "awaiting";
  if (action === "closed") return merged ? "merged" : "history";
  if (action === "opened" || action === "reopened") return "pending";
  throw new Error(`unsupported pull_request action ${action}`);
}

/** Build row for a pull request. Same id updates status as the PR moves. */
export function buildPrCalendarBody(input: {
  number: number;
  title: string;
  htmlUrl: string;
  createdAt: string;
  action: string;
  merged: boolean;
}): Record<string, unknown> {
  if (!Number.isInteger(input.number) || input.number <= 0) {
    throw new Error("pull request number is required.");
  }
  const title = `PR #${input.number} ${input.title}`
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const link = /^https:\/\/[^\s]+$/.test(input.htmlUrl) ? input.htmlUrl : "";
  const note = input.merged ? "merged" : input.action.replace(/_/g, " ");
  return {
    id: buildPrEventId(input.number),
    lane: "build",
    writer: "agent",
    start: zonedTimestamp(input.createdAt),
    title,
    status: buildPrStatus(input.action, input.merged),
    ...(link ? { link } : {}),
    note,
  };
}
