import { addDecimal, isDecimalString, subtractDecimal } from "@/lib/decimal";
import { formatHomePct } from "@/lib/home-lines";

export type PositionFill = {
  time: string;
  symbol: string;
  side?: string;
  quantity?: string;
  price?: string;
  sleeve?: string;
  kind?: string;
  result?: string;
};

export type PositionPnl = {
  text: string;
  tone: "up" | "down" | "flat";
};

/**
 * Average cost when the rh-agentic fills reproduce the sleeve quantity.
 * A gap, an unsleeved fill, or a sell the book cannot cover hides the cost.
 * Nothing here is estimated.
 */
export type PositionCost = {
  averageLabel: string;
  pnl: PositionPnl | null;
};

const AGENTIC = "rh-agentic";

function sameQty(left: string, right: string): boolean {
  return subtractDecimal(left, right) === "0";
}

function formatAverageUsd(usd: number): string | null {
  if (!Number.isFinite(usd) || usd <= 0) return null;
  const label = usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (label === "$0.00") return null;
  return label;
}

function pnlFor(average: number, priceUsd: number | null): PositionPnl | null {
  if (typeof priceUsd !== "number" || !Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  const pct = ((priceUsd - average) / average) * 100;
  const text = formatHomePct(pct);
  if (!text) return null;
  const tone = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  return { text: `P/L ${text}`, tone };
}

/**
 * Walk rh-agentic buys and sells for one ticker.
 * Returns null unless the remaining quantity is the sleeve quantity.
 */
export function positionCostFromFills(input: {
  fills: readonly PositionFill[];
  ticker: string;
  quantity: string;
  priceUsd: number | null;
}): PositionCost | null {
  const ticker = input.ticker.trim().toUpperCase();
  const quantity = input.quantity.trim();
  if (!ticker || !isDecimalString(quantity) || Number(quantity) <= 0) return null;

  const rows: PositionFill[] = [];
  for (const fill of input.fills) {
    if (fill.kind === "bet") continue;
    if (fill.symbol.trim().toUpperCase() !== ticker) continue;
    if (fill.sleeve !== AGENTIC) continue;
    if (fill.result && fill.result.trim().toLowerCase() !== "filled") continue;
    const side = fill.side;
    if (side !== "buy" && side !== "sell") return null;
    const qty = fill.quantity?.trim() ?? "";
    const price = fill.price?.trim() ?? "";
    if (!isDecimalString(qty) || Number(qty) <= 0) return null;
    if (!isDecimalString(price) || Number(price) <= 0) return null;
    if (!Number.isFinite(Date.parse(fill.time))) return null;
    rows.push(fill);
  }

  rows.sort((left, right) => Date.parse(left.time) - Date.parse(right.time));

  let qty = "0";
  let cost = 0;
  for (const fill of rows) {
    const traded = fill.quantity?.trim() ?? "0";
    const px = Number(fill.price);
    if (fill.side === "buy") {
      qty = addDecimal(qty, traded);
      cost += Number(traded) * px;
      continue;
    }
    if (subtractDecimal(qty, traded).startsWith("-")) return null;
    const held = Number(qty);
    if (!(held > 0)) return null;
    cost -= (cost / held) * Number(traded);
    qty = subtractDecimal(qty, traded);
    if (Number(qty) === 0) cost = 0;
  }

  if (!sameQty(qty, quantity)) return null;
  const held = Number(qty);
  if (!(held > 0) || !(cost > 0)) return null;
  const average = cost / held;
  const averageLabel = formatAverageUsd(average);
  if (!averageLabel) return null;
  return { averageLabel: `cost ${averageLabel}`, pnl: pnlFor(average, input.priceUsd) };
}
