import type { Fill, FillSleeveId, FillVenue } from "@/data/fills";
import {
  isFillVenue,
  isLockedTicker,
  isWritableSleeveId,
  type LockedTicker,
} from "@/lib/fill-event";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Newest rows shown on the search-desk strip. The strip reads the same store. */
export const RECENT_FILL_LIMIT = 6;

export const DESK_SLEEVES = [
  { id: "rh-main", label: "RH Main" },
  { id: "rh-agentic", label: "RH Agentic" },
  { id: "coinbase", label: "Coinbase" },
  { id: "unset", label: "unset" },
] as const;

export const DESK_SOURCES = [
  { id: "robinhood", label: "Robinhood" },
  { id: "coinbase", label: "Coinbase" },
  { id: "unset", label: "unset" },
] as const;

export type DeskSleeve = FillSleeveId | "unset";
export type DeskSource = FillVenue | "unset";

export type FillDeskQuery = {
  ticker: LockedTicker | "";
  from: string;
  to: string;
  sleeve: DeskSleeve | "";
  source: DeskSource | "";
};

export const EMPTY_FILL_DESK_QUERY: FillDeskQuery = {
  ticker: "",
  from: "",
  to: "",
  sleeve: "",
  source: "",
};

type RawParam = string | string[] | undefined;

export type FillDeskSearch = {
  ticker?: RawParam;
  from?: RawParam;
  to?: RawParam;
  sleeve?: RawParam;
  source?: RawParam;
};

function firstParam(value: RawParam): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

function readDay(value: string): string {
  return DAY.test(value) ? value : "";
}

function readSleeve(value: string): DeskSleeve | "" {
  const normalized = value.toLowerCase();
  if (normalized === "unset") return "unset";
  return isWritableSleeveId(normalized) ? normalized : "";
}

function readSource(value: string): DeskSource | "" {
  const normalized = value.toLowerCase();
  if (normalized === "unset") return "unset";
  return isFillVenue(normalized) ? normalized : "";
}

/**
 * Calendar day printed on the fill card (the offset in the stored timestamp).
 * Range filters use that day so the desk matches what the operator reads.
 */
export function fillCalendarDate(time: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T/.exec(time);
  if (match) return match[1];
  const parsed = Date.parse(time);
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toISOString().slice(0, 10);
}

export function parseFillDeskQuery(raw: FillDeskSearch = {}): FillDeskQuery {
  const tickerRaw = firstParam(raw.ticker).toUpperCase();
  let from = readDay(firstParam(raw.from));
  let to = readDay(firstParam(raw.to));
  if (from && to && from > to) {
    const swap = from;
    from = to;
    to = swap;
  }

  return {
    ticker: isLockedTicker(tickerRaw) ? tickerRaw : "",
    from,
    to,
    sleeve: readSleeve(firstParam(raw.sleeve)),
    source: readSource(firstParam(raw.source)),
  };
}

export function fillDeskIsActive(query: FillDeskQuery): boolean {
  return Boolean(query.ticker || query.from || query.to || query.sleeve || query.source);
}

/** Same store, view only. Does not reorder and does not drop unknown rows from the store. */
export function filterFills(rows: readonly Fill[], query: FillDeskQuery): Fill[] {
  return rows.filter((fill) => {
    if (query.ticker && fill.symbol.toUpperCase() !== query.ticker) return false;

    if (query.sleeve === "unset") {
      if (fill.sleeve) return false;
    } else if (query.sleeve && fill.sleeve !== query.sleeve) {
      return false;
    }

    if (query.source === "unset") {
      if (fill.venue) return false;
    } else if (query.source && fill.venue !== query.source) {
      return false;
    }

    const day = fillCalendarDate(fill.time);
    if (query.from && (!day || day < query.from)) return false;
    if (query.to && (!day || day > query.to)) return false;
    return true;
  });
}

export function recentFills(
  rows: readonly Fill[],
  limit = RECENT_FILL_LIMIT,
): Fill[] {
  if (limit <= 0) return [];
  return rows.slice(0, limit);
}

export function fillDeskHref(
  query: Partial<{
    ticker: string;
    from: string;
    to: string;
    sleeve: string;
    source: string;
  }> = {},
): string {
  const parsed = parseFillDeskQuery(query);
  const params = new URLSearchParams();
  if (parsed.ticker) params.set("ticker", parsed.ticker);
  if (parsed.from) params.set("from", parsed.from);
  if (parsed.to) params.set("to", parsed.to);
  if (parsed.sleeve) params.set("sleeve", parsed.sleeve);
  if (parsed.source) params.set("source", parsed.source);
  const search = params.toString();
  return search ? `/log?${search}` : "/log";
}
