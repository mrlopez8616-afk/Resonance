/**
 * Buy-date window for the lot bar chart. The end is the current civil day in
 * America/Chicago, so a UTC process does not slide the window at Chicago midnight.
 * 1D is that day. 1W is seven civil days. 1M and 1Y step the calendar and clamp
 * the day (31 Jan → 28 Feb). A bar with no buy day is outside every window.
 * All keeps every bar. Gain and loss stay the lot's current figure.
 */

export const LOT_RANGES = ["1D", "1W", "1M", "1Y", "All"] as const;

export type LotRange = (typeof LOT_RANGES)[number];

/** Columns compress and per-bar labels drop at this many visible bars. */
export const LOT_BAR_CROWDED_AT = 12;

/** Widest crowded bar, in CSS pixels. */
export const LOT_BAR_CROWDED_MAX = 4;

const CHICAGO = "America/Chicago";
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseLotRange(value: string | null | undefined): LotRange {
  if (value === "1D" || value === "1W" || value === "1M" || value === "1Y" || value === "All") {
    return value;
  }
  return "All";
}

/** First query value. A missing or unknown value is All. */
export function parseLotRangeQuery(value: string | string[] | undefined): LotRange {
  const raw = typeof value === "string" ? value : value?.[0];
  return parseLotRange(raw);
}

/** `YYYY-MM-DD` in America/Chicago. */
export function chicagoDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CHICAGO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function shiftDays(day: string, delta: number): string {
  const match = DAY.exec(day);
  if (!match) return day;
  const moved = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + delta));
  return utcDay(moved);
}

function shiftMonths(day: string, delta: number): string {
  const match = DAY.exec(day);
  if (!match) return day;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const date = Number(match[3]);
  const moved = new Date(Date.UTC(year, month + delta, 1));
  const last = new Date(Date.UTC(moved.getUTCFullYear(), moved.getUTCMonth() + 1, 0)).getUTCDate();
  moved.setUTCDate(Math.min(date, last));
  return utcDay(moved);
}

function utcDay(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Inclusive first buy day of the window, or null for All. */
export function lotRangeStart(range: LotRange, now: Date): string | null {
  if (range === "All") return null;
  const today = chicagoDay(now);
  if (range === "1D") return today;
  if (range === "1W") return shiftDays(today, -6);
  if (range === "1M") return shiftMonths(today, -1);
  return shiftMonths(today, -12);
}

export function filterLotBars<T extends { day: string }>(
  bars: readonly T[],
  range: LotRange,
  now: Date,
): T[] {
  if (range === "All") return bars.slice();
  const start = lotRangeStart(range, now);
  const today = chicagoDay(now);
  if (!start) return bars.slice();
  return bars.filter((bar) => DAY.test(bar.day) && bar.day >= start && bar.day <= today);
}
