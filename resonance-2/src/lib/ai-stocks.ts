import type { NodeSleeve } from "@/data/sleeves";
import { isDecimalString } from "@/lib/decimal";

/**
 * AI Stocks children, in home-bar and parent-card order.
 * Quotes, the day-change chart, the top mover, and catalyst lookup use this list.
 */
export const AI_STOCK_TICKERS = [
  "PWR",
  "VRT",
  "GEV",
  "CEG",
  "NVDA",
  "TSM",
  "TSLA",
  "SPCX",
] as const;

/**
 * Leaving the core. Still a sleeve book so a closing sell can post.
 * Not a child, not a home bar, and not a live quote.
 */
export const RETIRED_AI_TICKERS = ["ETN", "HUBB"] as const;

export type AiStockTicker = (typeof AI_STOCK_TICKERS)[number];
export type RetiredAiTicker = (typeof RETIRED_AI_TICKERS)[number];

const RETIRED_NODE_PARENT: Record<string, "ai-stocks"> = {
  etn: "ai-stocks",
  hubb: "ai-stocks",
};

/** Old child URLs. They are not pages anymore. */
export function retiredAiNodeHref(parentId: string, nodeId: string): string | null {
  const parent = RETIRED_NODE_PARENT[nodeId];
  if (!parent || parent !== parentId) return null;
  return `/n/${parent}`;
}

function quantityIsHeld(quantity: string): boolean {
  return isDecimalString(quantity) && Number(quantity) > 0;
}

/**
 * Retired names that still have a positive sleeve print.
 * A zero book has closed and drops off this list.
 */
export function retiringHeldTickers(
  books: Readonly<Record<string, readonly { quantity: string }[] | undefined>>,
): RetiredAiTicker[] {
  return RETIRED_AI_TICKERS.filter((ticker) => {
    const rows = books[ticker];
    return Boolean(rows?.some((row) => quantityIsHeld(row.quantity)));
  });
}

/** One line. No dollar amount, because these names are no longer quoted. */
export function retiringHeldLine(tickers: readonly string[]): string | null {
  if (tickers.length === 0) return null;
  if (tickers.length === 1) return `${tickers[0]} still held`;
  return `${tickers.join(", ")} still held`;
}

/**
 * Sleeves that are a real position.
 * A missing book, a zero print, or a non-decimal placeholder is not a position,
 * so the value card can say "no position" instead of printing $0.
 */
export function sleevesForEquityCard<T extends { quantity: string }>(
  sleeves: readonly T[] | undefined,
): T[] {
  return (sleeves ?? []).filter((row) => quantityIsHeld(row.quantity));
}

export function equityCardHasPosition(sleeves: readonly NodeSleeve[] | undefined): boolean {
  return sleevesForEquityCard(sleeves).length > 0;
}
