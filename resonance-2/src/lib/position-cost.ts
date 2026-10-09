import { isDecimalString } from "@/lib/decimal";
import { formatHomePct } from "@/lib/home-lines";
import { buildLotsLedger } from "@/lib/position-lots";

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
 * FIFO open-lot cost when the rh-agentic fills reproduce the sleeve quantity.
 * Buys open a lot. Sells close the oldest lots first and do not reprice the rest.
 * A gap, an unsleeved fill, or a book the fills do not match hides the cost.
 * Nothing here is estimated.
 */
export type PositionCost = {
  averageLabel: string;
  pnl: PositionPnl | null;
};

const AGENTIC = "rh-agentic";

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
 * FIFO cost for one ticker's rh-agentic fills.
 * Returns null unless the open lots reproduce the sleeve quantity.
 */
export function positionCostFromFills(input: {
  fills: readonly PositionFill[];
  ticker: string;
  quantity: string;
  priceUsd: number | null;
}): PositionCost | null {
  const quantity = input.quantity.trim();
  if (!isDecimalString(quantity) || Number(quantity) <= 0) return null;
  const ledger = buildLotsLedger({
    fills: input.fills,
    ticker: input.ticker,
    sleeve: AGENTIC,
    quantity,
    livePrice: input.priceUsd,
  });
  if (ledger.status !== "matched" || ledger.averageUsd === null) return null;
  const averageLabel = formatAverageUsd(ledger.averageUsd);
  if (!averageLabel) return null;
  return { averageLabel: `cost ${averageLabel}`, pnl: pnlFor(ledger.averageUsd, input.priceUsd) };
}
