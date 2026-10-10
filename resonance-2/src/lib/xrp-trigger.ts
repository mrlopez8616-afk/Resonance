import { chicagoDay, isCivilDay } from "@/lib/calendar-time";
import { formatHomePct, XRP_DAILY_CLOSE_USD } from "@/lib/home-lines";

/**
 * Read-only XRP treasury trigger. Nothing in this module trades or moves funds.
 *
 * A completed UTC daily close counts as above the line only when it is strictly
 * greater than `XRP_DAILY_CLOSE_USD` ($1.55). A print exactly on the line does
 * not count. The current UTC day is still a partial candle and is left out.
 * A missing calendar day ends the streak.
 *
 * Holds when that streak reaches `XRP_TRIGGER_HOLD_DAYS`. The founder set N to
 * 5. Change that one constant when the number changes. Founder's go stays
 * "not given": there is no switch here.
 */

/** Consecutive completed UTC closes strictly above $1.55. Founder set this to 5. */
export const XRP_TRIGGER_HOLD_DAYS = 5;

/** How many completed daily closes the strip draws. Newest on the right. */
export const XRP_TRIGGER_BAR_DAYS = 14;

export const XRP_TRIGGER_HREF = "/n/crypto/xrp-trigger";

/** Static. This build does not record a go and has no control that can. */
export const XRP_TRIGGER_FOUNDER_GO = "not given" as const;

export type DailyClose = {
  day: string;
  close: number;
};

export type TriggerBar = {
  day: string;
  ctLabel: string;
  close: number;
  above: boolean;
};

export type XrpTriggerChecklist = {
  dailyClose: string;
  holds: string;
  founderGo: string;
};

export type XrpTriggerState = "watching" | "above" | "holding" | "trigger";

export type XrpTriggerStatus = {
  lineUsd: number;
  holdDays: number;
  /** Latest completed UTC day, or null when no completed close exists. */
  lastDay: string | null;
  lastClose: number | null;
  /** That UTC day labeled on the Central Time clock. */
  ctLabel: string | null;
  above: boolean;
  streak: number;
  holds: boolean;
  /** Signed percent distance of the latest completed close from the line. */
  pctFromLine: number | null;
  distanceLabel: string | null;
  state: XrpTriggerState;
  stateLabel: string;
  founderGo: typeof XRP_TRIGGER_FOUNDER_GO;
  checklist: XrpTriggerChecklist;
  bars: TriggerBar[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

type MarketPoint = {
  t: number;
  usd: number;
};

function marketChartPoints(body: unknown): MarketPoint[] {
  if (typeof body !== "object" || body === null) return [];
  const prices = (body as { prices?: unknown }).prices;
  if (!Array.isArray(prices)) return [];
  const rows: MarketPoint[] = [];
  for (const row of prices) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const t = row[0];
    const usd = row[1];
    if (typeof t !== "number" || typeof usd !== "number") continue;
    if (!Number.isFinite(t) || !Number.isFinite(usd) || usd <= 0) continue;
    rows.push({ t, usd });
  }
  rows.sort((left, right) => left.t - right.t);
  return rows;
}

function utcDayFromMs(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * One close per UTC day from a CoinGecko `market_chart` body, oldest first.
 * The last print of that UTC day wins. Today's partial day is still included
 * here; `evaluateXrpTrigger` drops it.
 */
export function utcClosesFromMarketChart(body: unknown): DailyClose[] {
  const byDay = new Map<string, number>();
  for (const point of marketChartPoints(body)) {
    const day = utcDayFromMs(point.t);
    if (!day || !isCivilDay(day)) continue;
    byDay.set(day, point.usd);
  }
  return [...byDay.entries()]
    .sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0))
    .map(([day, close]) => ({ day, close }));
}

function utcToday(now: Date): string {
  const time = now.getTime();
  if (!Number.isFinite(time)) return "";
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * Central Time label for a completed UTC close day.
 * The candle finishes at 00:00 UTC the next day, which is still that UTC
 * date on the Chicago clock.
 */
export function ctLabelForUtcDay(day: string): string {
  if (!isCivilDay(day)) return day;
  const [year, month, date] = day.split("-").map(Number);
  const closeAt = new Date(Date.UTC(year, month - 1, date + 1));
  const ct = chicagoDay(closeAt.toISOString());
  if (!isCivilDay(ct)) return day;
  const ctMonth = Number(ct.slice(5, 7));
  const ctDate = Number(ct.slice(8, 10));
  const name = MONTHS[ctMonth - 1] ?? "";
  return `${name} ${ctDate} CT`;
}

function resolveHoldDays(holdDays: number | undefined): number {
  if (typeof holdDays === "number" && Number.isInteger(holdDays) && holdDays > 0) return holdDays;
  return XRP_TRIGGER_HOLD_DAYS;
}

function linePriceLabel(lineUsd: number): string {
  return `$${lineUsd.toFixed(2)}`;
}

function addDays(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date + delta));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function completedCloses(closes: readonly DailyClose[], today: string): DailyClose[] {
  const byDay = new Map<string, number>();
  for (const row of closes) {
    if (!isCivilDay(row.day)) continue;
    if (today && row.day >= today) continue;
    if (typeof row.close !== "number" || !Number.isFinite(row.close) || row.close <= 0) continue;
    byDay.set(row.day, row.close);
  }
  return [...byDay.entries()]
    .sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0))
    .map(([day, close]) => ({ day, close }));
}

/** Current run of consecutive UTC days ending at the latest completed close. */
function closeStreak(closes: readonly DailyClose[], lineUsd: number): number {
  const latest = closes[closes.length - 1];
  if (!latest || !(latest.close > lineUsd)) return 0;
  const byDay = new Map(closes.map((row) => [row.day, row.close]));
  let count = 0;
  let cursor = latest.day;
  while (true) {
    const close = byDay.get(cursor);
    if (close === undefined || !(close > lineUsd)) break;
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

function stateFor(streak: number, holdDays: number): { state: XrpTriggerState; stateLabel: string } {
  if (streak >= holdDays) {
    return { state: "trigger", stateLabel: "Trigger met, awaiting Founder's go" };
  }
  if (streak > 1) {
    return { state: "holding", stateLabel: `Holding (${streak}/${holdDays})` };
  }
  if (streak === 1) {
    return { state: "above", stateLabel: "Close above line" };
  }
  return { state: "watching", stateLabel: "Watching" };
}

/**
 * Status for the trigger watch.
 * `holdDays` overrides `XRP_TRIGGER_HOLD_DAYS` for a caller that is checking
 * another N. The page uses the constant.
 */
export function evaluateXrpTrigger(
  closes: readonly DailyClose[],
  now: Date,
  holdDays?: number,
): XrpTriggerStatus {
  const lineUsd = XRP_DAILY_CLOSE_USD;
  const days = resolveHoldDays(holdDays);
  const completed = completedCloses(closes, utcToday(now));
  const latest = completed[completed.length - 1] ?? null;
  const above = latest !== null && latest.close > lineUsd;
  const streak = closeStreak(completed, lineUsd);
  const holds = streak >= days;
  const pctFromLine =
    latest === null || !(lineUsd > 0) ? null : ((latest.close - lineUsd) / lineUsd) * 100;
  const distanceLabel = pctFromLine === null ? null : formatHomePct(pctFromLine);
  const { state, stateLabel } = stateFor(streak, days);
  const ctLabel = latest ? ctLabelForUtcDay(latest.day) : null;
  const lineLabel = linePriceLabel(lineUsd);
  const closeWord = days === 1 ? "close" : "closes";
  const dailyClose = latest
    ? `Daily close above ${lineLabel}: ${above ? "yes" : "no"}, ${ctLabel}`
    : `Daily close above ${lineLabel}: no`;
  const tail = completed.slice(-XRP_TRIGGER_BAR_DAYS);
  return {
    lineUsd,
    holdDays: days,
    lastDay: latest?.day ?? null,
    lastClose: latest?.close ?? null,
    ctLabel,
    above,
    streak,
    holds,
    pctFromLine,
    distanceLabel,
    state,
    stateLabel,
    founderGo: XRP_TRIGGER_FOUNDER_GO,
    checklist: {
      dailyClose,
      holds: `Holds for ${days} ${closeWord} in a row: ${streak} of ${days}`,
      founderGo: `Founder's go: ${XRP_TRIGGER_FOUNDER_GO}`,
    },
    bars: tail.map((row) => ({
      day: row.day,
      ctLabel: ctLabelForUtcDay(row.day),
      close: row.close,
      above: row.close > lineUsd,
    })),
  };
}
