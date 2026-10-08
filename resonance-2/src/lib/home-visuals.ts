import type { CalendarEvent } from "@/data/calendar";
import { BANKROLL_START, cardInBankroll, fightCardDay } from "@/lib/bankroll";
import { isDecimalString, addDecimal } from "@/lib/decimal";
import { civilWeekdayShort } from "@/lib/calendar-time";
import { money, realizedPnl, type Bet } from "@/lib/bets";
import { fightPromotions } from "@/lib/fight-desk";
import type { FitnessStepDay } from "@/lib/fitness-board";
import { XRP_DAILY_CLOSE_USD } from "@/lib/home-lines";

const SPARK_POINTS = 48;

export type XrpSpark = {
  prices: number[];
  referenceUsd: number;
};

export type StepSlot = {
  day: string;
  label: string;
  steps: number | null;
};

export type TierSegment = {
  id: "STRONG" | "LEAN" | "untiered";
  label: string;
  atRiskLabel: string;
  share: number;
};

const TIER_ORDER = ["STRONG", "LEAN", "untiered"] as const;
const TIER_LABEL: Record<(typeof TIER_ORDER)[number], string> = {
  STRONG: "STRONG",
  LEAN: "LEAN",
  untiered: "untiered",
};

function downsample(values: readonly number[], max: number): number[] {
  if (values.length <= max) return values.slice();
  const last = values.length - 1;
  const out: number[] = [];
  for (let index = 0; index < max; index += 1) {
    const at = Math.round((index * last) / (max - 1));
    const value = values[at];
    if (typeof value === "number") out.push(value);
  }
  return out;
}

type MarketPoint = {
  t: number;
  usd: number;
};

/** CoinGecko `market_chart` prices, oldest first. Invalid rows are dropped. */
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

/** CoinGecko `market_chart` prices, oldest first. Invalid rows are dropped. */
export function xrpPricesFromMarketChart(body: unknown): number[] {
  return marketChartPoints(body).map((point) => point.usd);
}

/** Seven-day close path plus the $1.55 reference. Hidden until two real prices exist. */
export function xrpSparkline(
  prices: readonly number[],
  referenceUsd = XRP_DAILY_CLOSE_USD,
): XrpSpark | null {
  const clean = prices.filter((price) => Number.isFinite(price) && price > 0);
  if (clean.length < 2) return null;
  if (!Number.isFinite(referenceUsd) || referenceUsd <= 0) return null;
  return { prices: downsample(clean, SPARK_POINTS), referenceUsd };
}

function stepLabel(day: string): string {
  return civilWeekdayShort(day).slice(0, 2);
}

/** One slot per civil day. Missing days stay empty. Hidden when the week has no step sample. */
export function fitnessStepBars(days: readonly FitnessStepDay[]): StepSlot[] | null {
  if (days.length === 0) return null;
  const slots = days.map((day) => {
    const steps =
      typeof day.steps === "number" && Number.isFinite(day.steps) && day.steps >= 0 ? day.steps : null;
    return { day: day.day, label: stepLabel(day.day), steps };
  });
  if (!slots.some((slot) => slot.steps !== null)) return null;
  return slots;
}

function centsFromLabel(label: string): bigint | null {
  const match = /^\$(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})$/.exec(label.trim());
  if (!match?.[1] || !match[2]) return null;
  const cents = BigInt(match[1].replace(/,/g, "")) * BigInt(100) + BigInt(match[2]);
  if (cents <= BigInt(0)) return null;
  return cents;
}

/** Open at-risk split. A zero tier is omitted. Hidden when nothing is at risk. */
export function predictionsTierBar(
  tiers: readonly { id: string; atRiskLabel: string }[],
): TierSegment[] | null {
  const amounts = new Map<(typeof TIER_ORDER)[number], { cents: bigint; atRiskLabel: string }>();
  for (const tier of tiers) {
    if (!TIER_ORDER.includes(tier.id as (typeof TIER_ORDER)[number])) continue;
    const id = tier.id as (typeof TIER_ORDER)[number];
    const cents = centsFromLabel(tier.atRiskLabel);
    if (cents === null) continue;
    amounts.set(id, { cents, atRiskLabel: tier.atRiskLabel.trim() });
  }
  let total = BigInt(0);
  for (const row of amounts.values()) total += row.cents;
  if (total <= BigInt(0)) return null;
  const segments: TierSegment[] = [];
  for (const id of TIER_ORDER) {
    const row = amounts.get(id);
    if (!row) continue;
    segments.push({
      id,
      label: TIER_LABEL[id],
      atRiskLabel: row.atRiskLabel,
      share: Number(row.cents) / Number(total),
    });
  }
  return segments.length > 0 ? segments : null;
}

/**
 * Running bankroll after each settled in-scope bet.
 * Hidden until two settlements exist, so a single print is not a line.
 */
export function inScopeBankrollPoints(
  bets: readonly Bet[],
  events: readonly CalendarEvent[] = [],
): number[] | null {
  const settled: { id: string; at: number; pnl: string }[] = [];
  for (const promotion of fightPromotions({ bets, events })) {
    for (const event of promotion.events) {
      const day = fightCardDay(event.slug, event.title, events);
      if (!cardInBankroll(day, event.bets)) continue;
      for (const bet of event.bets) {
        const status = bet.status;
        if (status !== "won" && status !== "lost" && status !== "sold" && status !== "void") continue;
        const pnl =
          bet.realizedPnl && isDecimalString(bet.realizedPnl)
            ? money(bet.realizedPnl)
            : realizedPnl(bet.stake, status, bet.settledPayout ?? bet.payout);
        const at = Date.parse(bet.settledAt ?? bet.time);
        if (!Number.isFinite(at)) continue;
        settled.push({ id: bet.id, at, pnl });
      }
    }
  }
  if (settled.length < 2) return null;
  settled.sort((left, right) => left.at - right.at || left.id.localeCompare(right.id));
  let cursor = BANKROLL_START;
  const points: number[] = [];
  for (const row of settled) {
    cursor = addDecimal(cursor, row.pnl);
    const value = Number(cursor);
    if (!Number.isFinite(value)) return null;
    points.push(value);
  }
  return points.length >= 2 ? points : null;
}
