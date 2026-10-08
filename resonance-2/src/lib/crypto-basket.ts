import { NODE_PARENT } from "@/data/node-parents";
import { isZeroCryptoHolding } from "@/lib/node-parents";

/**
 * CoinGecko `market_chart` span the crypto basket uses.
 * Seven days is the window the existing helper already requests.
 */
export const CRYPTO_BASKET_DAYS = 7;

export type MarketPoint = {
  t: number;
  usd: number;
};

export type DailyClose = {
  day: string;
  usd: number;
};

export type CryptoFaceQty = {
  id: string;
  ticker: string;
  /** Sleeve total the live face already summed. Do not add the vault again. */
  quantity: number;
  totalUsd: number | null;
};

export type CryptoBasketLeg = {
  id: string;
  quantity: number;
  closes: readonly DailyClose[];
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** CoinGecko `market_chart` prices, oldest first. Invalid rows are dropped. */
export function marketChartPoints(body: unknown): MarketPoint[] {
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

/** Last real print on each UTC day. A day with no valid print is absent. */
export function dailyCloses(points: readonly MarketPoint[]): DailyClose[] {
  const last = new Map<string, { t: number; usd: number }>();
  for (const point of points) {
    if (!Number.isFinite(point.t) || !Number.isFinite(point.usd) || point.usd <= 0) continue;
    const day = new Date(point.t).toISOString().slice(0, 10);
    const prev = last.get(day);
    if (!prev || point.t >= prev.t) last.set(day, { t: point.t, usd: point.usd });
  }
  return [...last.entries()]
    .sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0))
    .map(([day, row]) => ({ day, usd: row.usd }));
}

/**
 * Crypto faces the home card can count.
 * Quantity is the face's sleeve total, which already includes the Flare vault
 * when that line is on the card. A ~$0.00 book and an unknown quantity stay out.
 */
export function heldCryptoQuantities(
  faces: readonly CryptoFaceQty[],
): { id: string; ticker: string; quantity: number }[] {
  const held: { id: string; ticker: string; quantity: number }[] = [];
  for (const face of faces) {
    if (NODE_PARENT[face.id as keyof typeof NODE_PARENT] !== "crypto") continue;
    if (isZeroCryptoHolding(face.ticker, face.totalUsd)) continue;
    if (!Number.isFinite(face.quantity) || face.quantity <= 0) continue;
    held.push({ id: face.id, ticker: face.ticker, quantity: face.quantity });
  }
  return held;
}

/**
 * Basket value on days when every held asset has a real close.
 * A missing close drops that day. No held assets, or fewer than two
 * complete days, returns null so the chart stays hidden.
 */
export function cryptoBasketValues(
  legs: readonly { quantity: number; closes: readonly DailyClose[] }[],
): number[] | null {
  const held = legs.filter((leg) => Number.isFinite(leg.quantity) && leg.quantity > 0);
  if (held.length === 0) return null;

  const books = held.map((leg) => {
    const prices = new Map<string, number>();
    for (const close of leg.closes) {
      if (typeof close.day !== "string" || !DAY.test(close.day)) continue;
      if (!Number.isFinite(close.usd) || close.usd <= 0) continue;
      prices.set(close.day, close.usd);
    }
    return { quantity: leg.quantity, prices };
  });

  const first = books[0];
  if (!first) return null;
  const days = [...first.prices.keys()].sort();
  const values: number[] = [];
  for (const day of days) {
    let sum = 0;
    let complete = true;
    for (const book of books) {
      const usd = book.prices.get(day);
      if (usd === undefined) {
        complete = false;
        break;
      }
      sum += book.quantity * usd;
    }
    if (!complete || !Number.isFinite(sum)) continue;
    values.push(sum);
  }
  return values.length >= 2 ? values : null;
}
