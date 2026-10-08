import type { CalendarEvent } from "@/data/calendar";
import { chicagoDay, chicagoToday, formatCivilDate, formatCivilMonth } from "@/lib/calendar-time";
import type { FitnessHomeLine, FitnessWeekFacts } from "@/lib/fitness-board";
import { EQUITY_FACE_TICKERS, formatSpotPrice } from "@/lib/live-face";

/** Daily close the crypto card measures XRP against. Not a position. */
export const XRP_DAILY_CLOSE_USD = 1.55;

/**
 * A quote older than this is not shown. The floor refetches on each request,
 * so a live render is well inside the window.
 */
export const HOME_QUOTE_MAX_AGE_MS = 15 * 60 * 1000;

/** Shown when there is no owner snapshot. No balances. */
export const FINANCE_HOME_LABEL = "Bank linked · private";

const BLOCKED = /\$0\.00|\bNaN\b|\bundefined\b/;
const AI_TICKERS = new Set<string>(EQUITY_FACE_TICKERS);

export type HomeQuote = {
  usd: number | null;
  change24hPct: number | null;
  fetchedAt: string | null;
};

export type HomeMove = {
  /** Floor node id, used to honor a hidden square. */
  id: string;
  ticker: string;
  changePct: number | null;
  fetchedAt: string | null;
};

export type PredictionsHomeFacts = {
  atRisk: string;
  atRiskLabel: string;
  open: number;
  recordLabel: string;
};

function publish(line: string | null | undefined): string | null {
  if (typeof line !== "string") return null;
  const trimmed = line.trim();
  if (!trimmed || BLOCKED.test(trimmed)) return null;
  return trimmed;
}

function keep(lines: readonly (string | null | undefined)[]): string[] {
  return lines.flatMap((line) => {
    const next = publish(line);
    return next ? [next] : [];
  });
}

/** True when the feed timestamp is present and inside the live window. */
export function homeQuoteFresh(fetchedAt: string | null | undefined, now: Date): boolean {
  if (!fetchedAt) return false;
  const at = Date.parse(fetchedAt);
  if (!Number.isFinite(at)) return false;
  const age = now.getTime() - at;
  if (age < -60_000) return false;
  return age <= HOME_QUOTE_MAX_AGE_MS;
}

/** Signed percent with one decimal. A real zero prints `0.0%`. */
export function formatHomePct(pct: number): string | null {
  if (!Number.isFinite(pct)) return null;
  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0) return "0.0%";
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(1)}%`;
}

function shortCivil(day: string, today: string): string {
  const full = formatCivilDate(day);
  if (day.slice(0, 4) === today.slice(0, 4)) return full.replace(/ \d{4}$/, "");
  return full;
}

function countLabel(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  return Math.round(value).toLocaleString("en-US");
}

/**
 * XRP spot and the path to a $1.55 daily close.
 * The price line needs both a fresh price and a fresh 24h change.
 * The close line needs only the fresh price.
 */
export function cryptoSecondaryLines(quote: HomeQuote | null, now: Date): string[] {
  if (!quote || !homeQuoteFresh(quote.fetchedAt, now)) return [];
  const usd = quote.usd;
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) return [];
  const price = formatSpotPrice(usd);
  if (price === "—") return [];
  const change =
    typeof quote.change24hPct === "number" ? formatHomePct(quote.change24hPct) : null;
  const priceLine = change ? `XRP ${price}, ${change} 24h` : null;
  const progress = (usd / XRP_DAILY_CLOSE_USD) * 100;
  const progressLabel = formatHomePct(progress);
  const closeLine =
    progressLabel && progressLabel !== "0.0%"
      ? `$1.55 close: ${progressLabel.replace(/^\+/, "")} there`
      : null;
  return keep([priceLine, closeLine]);
}

export type ChangeBar = {
  ticker: string;
  changePct: number;
};

/**
 * Session-change bars in floor order. A stale or missing quote is left out.
 * Hidden when none of the six is live.
 */
export function aiChangeBars(moves: readonly HomeMove[], now: Date): ChangeBar[] | null {
  const byTicker = new Map(moves.map((move) => [move.ticker, move]));
  const bars: ChangeBar[] = [];
  for (const ticker of EQUITY_FACE_TICKERS) {
    const move = byTicker.get(ticker);
    if (!move || !homeQuoteFresh(move.fetchedAt, now)) continue;
    if (typeof move.changePct !== "number" || !Number.isFinite(move.changePct)) continue;
    bars.push({ ticker, changePct: move.changePct });
  }
  return bars.length > 0 ? bars : null;
}

export function visibleHomeMoves(moves: readonly HomeMove[], hiddenIds: readonly string[]): HomeMove[] {
  const hidden = new Set(hiddenIds);
  return moves.filter((move) => move.id && !hidden.has(move.id));
}

/** Largest absolute session change among the moves passed in. Ties prefer the higher signed change, then ticker. */
export function topMoverLine(moves: readonly HomeMove[], now: Date): string | null {
  const live = moves.filter((move) => {
    if (!move.ticker.trim()) return false;
    if (!homeQuoteFresh(move.fetchedAt, now)) return false;
    return typeof move.changePct === "number" && Number.isFinite(move.changePct);
  });
  if (live.length === 0) return null;
  live.sort((left, right) => {
    const leftPct = left.changePct ?? 0;
    const rightPct = right.changePct ?? 0;
    const byAbs = Math.abs(rightPct) - Math.abs(leftPct);
    if (byAbs !== 0) return byAbs;
    if (rightPct !== leftPct) return rightPct - leftPct;
    return left.ticker.localeCompare(right.ticker);
  });
  const top = live[0];
  if (!top || typeof top.changePct !== "number") return null;
  const change = formatHomePct(top.changePct);
  if (!change) return null;
  return publish(`${top.ticker} ${change}`);
}

/** Soonest AI-stock catalyst on or after today. Past rows and other nodes are skipped. */
export function nextAiCatalystLine(events: readonly CalendarEvent[], now: Date): string | null {
  const today = chicagoToday(now);
  const upcoming = events.flatMap((event) => {
    if (event.kind !== "catalyst" || !event.node || !AI_TICKERS.has(event.node)) return [];
    const day = chicagoDay(event.start);
    if (!day || day < today) return [];
    return [{ event, day }];
  });
  upcoming.sort((left, right) => {
    if (left.day !== right.day) return left.day < right.day ? -1 : 1;
    return left.event.title.localeCompare(right.event.title);
  });
  const next = upcoming[0];
  if (!next) return null;
  const when =
    next.event.datePrecision === "month" ? formatCivilMonth(next.day) : shortCivil(next.day, today);
  if (!when.trim()) return null;
  const earnings = /earnings/i.test(next.event.title);
  return publish(earnings ? `${next.event.node} earnings · ${when}` : `${next.event.node} · ${when}`);
}

export function aiStockSecondaryLines(input: {
  moves: readonly HomeMove[];
  events?: readonly CalendarEvent[];
  catalystLine?: string | null;
  now: Date;
}): string[] {
  const catalyst =
    input.catalystLine !== undefined
      ? input.catalystLine
      : input.events
        ? nextAiCatalystLine(input.events, input.now)
        : null;
  return keep([topMoverLine(input.moves, input.now), catalyst]);
}

/**
 * Week steps, active calories, and resting HR.
 * When all three are missing, the miles line stands in, unless it repeats the headline.
 */
export function fitnessSecondaryLines(
  week: FitnessWeekFacts | null,
  headline: FitnessHomeLine | null = null,
): string[] {
  if (!week) return [];
  const steps = week.steps === null ? null : countLabel(week.steps);
  const kcal = week.activeKcal === null ? null : countLabel(week.activeKcal);
  const resting = week.restingHr === null ? null : countLabel(week.restingHr);
  const lines = keep([
    steps === null ? null : `${steps} steps this week`,
    kcal === null ? null : `${kcal} kcal this week`,
    resting === null ? null : `${resting} bpm resting`,
  ]);
  if (lines.length > 0) return lines;
  if (typeof week.miles !== "number" || !Number.isFinite(week.miles) || week.miles <= 0) return [];
  const miles = `${week.miles.toFixed(1)} mi this week`;
  const shown = headline ? `${headline.value} ${headline.unit}`.trim() : "";
  if (shown === miles) return [];
  return keep([miles]);
}

/** No hint and no dollar figure. The card's only finance copy is the static label. */
export function financeSecondaryLines(): string[] {
  return [];
}

/** Bankroll stays the headline. These are the lines under it. A zero dollar amount is omitted. */
export function predictionsSecondaryLines(facts: PredictionsHomeFacts | null): string[] {
  if (!facts) return [];
  const atRisk =
    facts.atRisk === "0.00" || facts.atRiskLabel === "$0.00" ? null : `${facts.atRiskLabel} at risk`;
  const open = Number.isInteger(facts.open) && facts.open >= 0
    ? facts.open === 1
      ? "1 open"
      : `${facts.open} open`
    : null;
  return keep([atRisk, open, facts.recordLabel]);
}

/** Headline dollars. `$0.00` is not a headline. */
export function predictionsHeadline(label: string | null | undefined): string | null {
  return publish(label ?? null);
}
