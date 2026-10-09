import { AI_STOCK_TICKERS, RETIRED_AI_TICKERS } from "@/lib/ai-stocks";
import { addDecimal, isDecimalString, subtractDecimal } from "@/lib/decimal";
import { yahooSessionDay } from "@/lib/equity-chart";
import { formatHomePct } from "@/lib/home-lines";
import { formatTotalUnits, totalSleeveQuantity } from "@/lib/live-face";

/** Open lots shown before the rest sit behind "show all". */
export const LOT_PREVIEW = 10;

const RETIRED = new Set<string>(RETIRED_AI_TICKERS);
const EQUITY = new Set<string>(AI_STOCK_TICKERS);

/** Sleeves whose fills are lots. The vault is a manual note, not one of these. */
export const LOT_SLEEVES = ["rh-agentic", "coinbase", "cb-agentic"] as const;

export type LotSleeveId = (typeof LOT_SLEEVES)[number];

export const LOT_SLEEVE_LABEL: Record<LotSleeveId, string> = {
  "rh-agentic": "RH Agentic",
  coinbase: "Coinbase",
  "cb-agentic": "Coinbase Agentic",
};

/** Sleeve whose fills explain the position. The XRP vault is not one of these. */
export function positionSleeve(ticker: string): "rh-agentic" | "coinbase" | null {
  const upper = ticker.trim().toUpperCase();
  if (upper === "SUI") return "coinbase";
  if (upper === "XRP" || EQUITY.has(upper)) return "rh-agentic";
  return null;
}

export function vaultUnknownLine(quantity: string | null | undefined): string | null {
  const qty = quantity?.trim() ?? "";
  if (!isDecimalString(qty) || Number(qty) <= 0) return null;
  return "Flare / Xaman vault · manual · entry unknown";
}

/**
 * Coinbase Agentic XRP arrived by transfer. No fill explains it, so the
 * line names the quantity and refuses a cost. The Default portfolio is
 * not this sleeve and is not a line.
 */
export function coinbaseAgenticUnknownLine(quantity: string | null | undefined): string | null {
  const qty = quantity?.trim() ?? "";
  if (!isDecimalString(qty) || Number(qty) <= 0) return null;
  return `Coinbase Agentic · ${qty} · entry unknown`;
}

/** A positive cb-agentic print on XRP. Any other ticker, including a coinbase sleeve, is ignored. */
export function xrpAgenticUnknownLine(
  ticker: string,
  sleeves: readonly { id: string; quantity: string }[] | undefined,
): string | null {
  if (ticker.trim().toUpperCase() !== "XRP") return null;
  const row = sleeves?.find((item) => item.id === "cb-agentic");
  return coinbaseAgenticUnknownLine(row?.quantity);
}

/** The lots total stays partial while an uncosted sleeve is on the book. */
export function totalsWithUnknownHolding(totals: BookTotals, unknownLine: string | null): BookTotals {
  if (!unknownLine) return totals;
  return {
    ...totals,
    partial: true,
    partialLabel: totals.partialLabel === "entry unknown" ? "entry unknown" : "partial",
  };
}

export type LedgerFill = {
  time: string;
  symbol: string;
  side?: string;
  quantity?: string;
  price?: string;
  sleeve?: string;
  kind?: string;
  result?: string;
};

export type LotStatus = "matched" | "short" | "over";

export type OpenLot = {
  time: string;
  day: string;
  originalQty: string;
  remainingQty: string;
  /** "2 of 3" after a partial sell. Otherwise the remaining quantity. */
  sharesLabel: string;
  price: string;
  entryUsd: number;
  valueUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
};

export type ClosedLot = {
  time: string;
  day: string;
  originalQty: string;
  price: string;
  realizedPnlUsd: number;
};

export type FillMarker = {
  time: string;
  day: string;
  side: "buy" | "sell";
  quantity: string;
  price: string;
};

export type LotsLedger = {
  status: LotStatus;
  sleeve: string;
  /** Newest open lot first. */
  openLots: OpenLot[];
  /** Newest close first. */
  closedLots: ClosedLot[];
  gapShares: string | null;
  note: string | null;
  /** Shares still open in the explained lots. */
  openShares: string;
  averageUsd: number | null;
  costUsd: number | null;
  markers: FillMarker[];
  /** End-of-day shares and FIFO cost, oldest day first. */
  days: DayBook[];
};

export type DayBook = {
  day: string;
  shares: string;
  costUsd: number;
  averageUsd: number | null;
};

export type DailyClose = { day: string; close: number };

export type ChartPoint = {
  day: string;
  valueUsd: number;
  costUsd: number | null;
};

export type PositionChart = {
  mode: "matched" | "holdings";
  caption: string | null;
  entry: string | null;
  points: ChartPoint[];
  markers: FillMarker[];
};

export type BookTotals = {
  sharesLabel: string;
  averageUsd: number | null;
  costUsd: number | null;
  valueUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
  /** Known-lot cost does not cover every share. */
  partial: boolean;
  partialLabel: string | null;
  /**
   * `holding` is shares and market value with cost and P/L omitted.
   * `known` is the costed lots.
   */
  presentation?: "known" | "holding";
};

export type RollupRow = {
  ticker: string;
  costUsd: number | null;
  valueUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
  partial: boolean;
};

export type PositionRollup = {
  rows: RollupRow[];
  costUsd: number | null;
  valueUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
  partial: boolean;
  points: ChartPoint[];
};

type WorkingLot = {
  time: string;
  day: string;
  original: string;
  remaining: string;
  price: number;
  priceText: string;
  realized: number;
};

function qtyCmp(left: string, right: string): number {
  const delta = subtractDecimal(left, right);
  if (delta === "0") return 0;
  return delta.startsWith("-") ? -1 : 1;
}

function positiveQty(value: string | undefined): string | null {
  const qty = value?.trim() ?? "";
  if (!isDecimalString(qty) || qty.startsWith("-") || Number(qty) <= 0) return null;
  return qty;
}

export function sessionDay(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return yahooSessionDay(ms / 1000);
}

function addDays(day: string, count: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (date ?? 1) + count));
  return next.toISOString().slice(0, 10);
}

function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  if (from > to) return days;
  let day = from;
  while (day <= to && days.length < 4000) {
    days.push(day);
    day = addDays(day, 1);
  }
  return days;
}

function money(usd: number): number {
  return Math.round(usd * 100) / 100;
}

function sharesLabel(remaining: string, original: string): string {
  if (qtyCmp(remaining, original) === 0) return remaining;
  return `${remaining} of ${original}`;
}

function lotValue(remaining: string, price: number, live: number | null): {
  valueUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
} {
  if (live === null) return { valueUsd: null, pnlUsd: null, pnlPct: null };
  const shares = Number(remaining);
  const valueUsd = money(shares * live);
  const pnlUsd = money(shares * (live - price));
  const pnlPct = price > 0 ? ((live - price) / price) * 100 : null;
  return { valueUsd, pnlUsd, pnlPct };
}

const MISMATCH = "fills don't match holdings";

function emptyLedger(sleeve: string, status: LotStatus, note: string | null): LotsLedger {
  return {
    status,
    sleeve,
    openLots: [],
    closedLots: [],
    gapShares: null,
    note,
    openShares: "0",
    averageUsd: null,
    costUsd: null,
    markers: [],
    days: [],
  };
}

/**
 * FIFO open lots for one sleeve.
 * A null sleeve is ignored. A sell the open lots cannot cover, or a remaining
 * quantity above the sleeve, is a mismatch: no lot is treated as the position.
 * A remaining quantity below the sleeve is a gap, not a guess.
 */
export function buildLotsLedger(input: {
  fills: readonly LedgerFill[];
  ticker: string;
  sleeve: string;
  quantity: string;
  livePrice?: number | null;
}): LotsLedger {
  const ticker = input.ticker.trim().toUpperCase();
  const sleeve = input.sleeve.trim();
  const quantity = input.quantity.trim();
  const live =
    typeof input.livePrice === "number" && Number.isFinite(input.livePrice) && input.livePrice > 0
      ? input.livePrice
      : null;
  if (!ticker || !sleeve || !isDecimalString(quantity) || Number(quantity) <= 0) {
    return emptyLedger(sleeve, "over", MISMATCH);
  }

  const rows: { time: string; day: string; side: "buy" | "sell"; qty: string; price: number; priceText: string }[] = [];
  for (const fill of input.fills) {
    if (fill.kind === "bet") continue;
    if (fill.symbol.trim().toUpperCase() !== ticker) continue;
    if (fill.sleeve !== sleeve) continue;
    if (fill.result && fill.result.trim().toLowerCase() !== "filled") continue;
    const side = fill.side;
    const qty = positiveQty(fill.quantity);
    const priceText = fill.price?.trim() ?? "";
    const day = sessionDay(fill.time);
    if ((side !== "buy" && side !== "sell") || !qty || !isDecimalString(priceText) || Number(priceText) <= 0 || !day) {
      return emptyLedger(sleeve, "over", MISMATCH);
    }
    rows.push({ time: fill.time, day, side, qty, price: Number(priceText), priceText });
  }
  rows.sort((left, right) => Date.parse(left.time) - Date.parse(right.time));

  const open: WorkingLot[] = [];
  const closed: WorkingLot[] = [];
  const markers: FillMarker[] = [];
  const dayStates: DayBook[] = [];
  let lastDay = "";

  const snapshot = (): DayBook => {
    let shares = "0";
    let cost = 0;
    for (const lot of open) {
      if (qtyCmp(lot.remaining, "0") === 0) continue;
      shares = addDecimal(shares, lot.remaining);
      cost += Number(lot.remaining) * lot.price;
    }
    const average = Number(shares) > 0 ? cost / Number(shares) : null;
    return { day: lastDay, shares, costUsd: money(cost), averageUsd: average };
  };

  for (const row of rows) {
    markers.push({ time: row.time, day: row.day, side: row.side, quantity: row.qty, price: row.priceText });
    if (row.side === "buy") {
      open.push({
        time: row.time,
        day: row.day,
        original: row.qty,
        remaining: row.qty,
        price: row.price,
        priceText: row.priceText,
        realized: 0,
      });
    } else {
      let left = row.qty;
      for (const lot of open) {
        if (qtyCmp(left, "0") === 0) break;
        if (qtyCmp(lot.remaining, "0") === 0) continue;
        const take = qtyCmp(lot.remaining, left) <= 0 ? lot.remaining : left;
        lot.realized += (row.price - lot.price) * Number(take);
        lot.remaining = subtractDecimal(lot.remaining, take);
        left = subtractDecimal(left, take);
      }
      if (qtyCmp(left, "0") !== 0) return emptyLedger(sleeve, "over", MISMATCH);
      for (let index = open.length - 1; index >= 0; index -= 1) {
        const lot = open[index];
        if (!lot || qtyCmp(lot.remaining, "0") !== 0) continue;
        closed.push(lot);
        open.splice(index, 1);
      }
    }
    lastDay = row.day;
    const state = snapshot();
    const previous = dayStates.at(-1);
    if (previous?.day === state.day) dayStates[dayStates.length - 1] = state;
    else dayStates.push(state);
  }

  const end = dayStates.at(-1);
  const openShares = end?.shares ?? "0";
  const compared = qtyCmp(openShares, quantity);
  if (compared > 0) return emptyLedger(sleeve, "over", MISMATCH);

  const openLots: OpenLot[] = open
    .filter((lot) => qtyCmp(lot.remaining, "0") > 0)
    .map((lot) => {
      const priced = lotValue(lot.remaining, lot.price, live);
      return {
        time: lot.time,
        day: lot.day,
        originalQty: lot.original,
        remainingQty: lot.remaining,
        sharesLabel: sharesLabel(lot.remaining, lot.original),
        price: lot.priceText,
        entryUsd: lot.price,
        ...priced,
      };
    })
    .reverse();

  const closedLots: ClosedLot[] = closed
    .map((lot) => ({
      time: lot.time,
      day: lot.day,
      originalQty: lot.original,
      price: lot.priceText,
      realizedPnlUsd: money(lot.realized),
    }))
    .reverse();

  const gapShares = compared < 0 ? subtractDecimal(quantity, openShares) : null;
  return {
    status: gapShares ? "short" : "matched",
    sleeve,
    openLots,
    closedLots,
    gapShares,
    note: null,
    openShares,
    averageUsd: end && Number(openShares) > 0 ? end.averageUsd : null,
    costUsd: end && Number(openShares) > 0 ? end.costUsd : null,
    markers,
    days: dayStates,
  };
}

export function bookTotals(ledger: LotsLedger, livePrice: number | null, sleeveShares: string): BookTotals {
  const live = typeof livePrice === "number" && livePrice > 0 ? livePrice : null;
  if (ledger.status === "over") {
    const value = live ? money(Number(sleeveShares) * live) : null;
    return {
      sharesLabel: sleeveShares,
      averageUsd: null,
      costUsd: null,
      valueUsd: value,
      pnlUsd: null,
      pnlPct: null,
      partial: true,
      partialLabel: "entry unknown",
    };
  }
  const cost = ledger.costUsd;
  const knownValue =
    live && Number(ledger.openShares) > 0 ? money(Number(ledger.openShares) * live) : null;
  const pnlUsd = cost !== null && knownValue !== null ? money(knownValue - cost) : null;
  const pnlPct =
    cost !== null && cost > 0 && ledger.averageUsd !== null && live !== null
      ? ((live - ledger.averageUsd) / ledger.averageUsd) * 100
      : null;
  const partial = ledger.status === "short";
  return {
    sharesLabel: partial ? ledger.openShares : sleeveShares,
    averageUsd: ledger.averageUsd,
    costUsd: cost,
    valueUsd: knownValue,
    pnlUsd,
    pnlPct,
    partial,
    partialLabel: partial ? "known lots" : null,
  };
}

function closeOn(closes: readonly DailyClose[], day: string, carried: number | null): number | null {
  const found = closes.find((row) => row.day === day);
  if (found) return found.close;
  return carried;
}

/** Retired names have no chart. A full FIFO match draws value and cost. Anything else is the last 30 closes at the current quantity. */
export function buildPositionChart(input: {
  ticker: string;
  ledger: LotsLedger;
  closes: readonly DailyClose[];
  quantity: string;
  today: string;
}): PositionChart | null {
  const ticker = input.ticker.trim().toUpperCase();
  if (RETIRED.has(ticker)) return null;
  const closes = input.closes.filter((row) => row.day <= input.today && row.close > 0);
  if (closes.length < 2) return null;
  const quantity = input.quantity.trim();
  if (!isDecimalString(quantity) || Number(quantity) <= 0) return null;

  if (input.ledger.status === "matched" && input.ledger.days.length > 0) {
    const first = input.ledger.days[0]?.day;
    if (!first) return null;
    let carried: number | null = null;
    let shares = "0";
    let cost = 0;
    let dayIndex = 0;
    const points: ChartPoint[] = [];
    for (const day of eachDay(first, input.today)) {
      while (dayIndex < input.ledger.days.length && (input.ledger.days[dayIndex]?.day ?? "") <= day) {
        const state = input.ledger.days[dayIndex];
        if (state) {
          shares = state.shares;
          cost = state.costUsd;
        }
        dayIndex += 1;
      }
      const close = closeOn(closes, day, carried);
      if (close === null) continue;
      carried = close;
      if (Number(shares) <= 0) continue;
      points.push({ day, valueUsd: money(Number(shares) * close), costUsd: cost });
    }
    if (points.length < 2) return null;
    return { mode: "matched", caption: null, entry: null, points, markers: input.ledger.markers };
  }

  const recent = closes.slice(-30);
  if (recent.length < 2) return null;
  return {
    mode: "holdings",
    caption: "Value at current holdings · entry unknown",
    entry: null,
    points: recent.map((row) => ({ day: row.day, valueUsd: money(Number(quantity) * row.close), costUsd: null })),
    markers: [],
  };
}

function positiveShares(value: string | null | undefined): string | null {
  const qty = value?.trim() ?? "";
  if (!isDecimalString(qty) || Number(qty) <= 0) return null;
  return qty;
}

function sumShares(parts: readonly (string | null | undefined)[]): string {
  let total = "0";
  for (const part of parts) {
    const qty = positiveShares(part);
    if (qty) total = addDecimal(total, qty);
  }
  return total;
}

function positiveMoney(usd: number | null): number | null {
  if (usd === null || !Number.isFinite(usd) || usd === 0) return null;
  return usd;
}

/**
 * Totals for the lots table.
 * No costed lot: the whole holding (sleeve, uncosted sleeves, and the vault)
 * prints as shares and value. A costed book keeps that cost and P/L, and
 * stays partial while another sleeve is uncosted. A zero share count and a
 * zero dollar amount are omitted.
 *
 * `holdingUnits` is the header token count (every sleeve, including the vault).
 * When it is set, the total shares and value use that count. Cost stays on
 * the explained lots. A vault or an uncosted sleeve keeps the total partial
 * and drops the blended P/L.
 */
export function positionBookTotals(input: {
  ledger: LotsLedger;
  livePrice: number | null;
  sleeveShares: string;
  unknownShares?: string | null;
  vaultShares?: string | null;
  holdingUnits?: number | null;
  addedCostUsd?: number | null;
  unexplained?: boolean;
}): BookTotals {
  const base = rawPositionBookTotals(input);
  if (typeof input.holdingUnits !== "number" || !(input.holdingUnits > 0)) return base;
  return overlayHoldingTotals(base, input.holdingUnits, input);
}

function rawPositionBookTotals(input: {
  ledger: LotsLedger;
  livePrice: number | null;
  sleeveShares: string;
  unknownShares?: string | null;
  vaultShares?: string | null;
}): BookTotals {
  const known = input.ledger.costUsd !== null && Number(input.ledger.openShares) > 0;
  if (!known) {
    const shares = sumShares([input.sleeveShares, input.unknownShares, input.vaultShares]);
    const live = typeof input.livePrice === "number" && input.livePrice > 0 ? input.livePrice : null;
    const amount = Number(shares);
    const value = live && amount > 0 ? amount * live : null;
    return {
      sharesLabel: amount > 0 ? formatTotalUnits(amount) : "",
      averageUsd: null,
      costUsd: null,
      valueUsd: positiveMoney(value),
      pnlUsd: null,
      pnlPct: null,
      partial: true,
      partialLabel: "entry unknown",
      presentation: "holding",
    };
  }
  const totals = bookTotals(input.ledger, input.livePrice, input.sleeveShares);
  const partial = totals.partial || positiveShares(input.unknownShares) !== null;
  const pnlUsd = positiveMoney(totals.pnlUsd);
  return {
    ...totals,
    sharesLabel: Number(totals.sharesLabel) > 0 ? totals.sharesLabel : "",
    costUsd: positiveMoney(totals.costUsd),
    valueUsd: positiveMoney(totals.valueUsd),
    pnlUsd,
    pnlPct: pnlUsd === null ? null : totals.pnlPct,
    partial,
    partialLabel: partial ? "partial" : null,
    presentation: "known",
  };
}

function overlayHoldingTotals(
  base: BookTotals,
  holdingUnits: number,
  input: {
    livePrice: number | null;
    addedCostUsd?: number | null;
    unexplained?: boolean;
  },
): BookTotals {
  const live = typeof input.livePrice === "number" && input.livePrice > 0 ? input.livePrice : null;
  const added = typeof input.addedCostUsd === "number" && input.addedCostUsd > 0 ? input.addedCostUsd : 0;
  const cost =
    base.costUsd !== null || added > 0 ? money((base.costUsd ?? 0) + added) : null;
  const unexplained = base.partial || input.unexplained === true;
  const value = live ? money(holdingUnits * live) : base.valueUsd;
  const sharesLabel = formatTotalUnits(holdingUnits);
  if (cost === null) {
    return {
      sharesLabel,
      averageUsd: null,
      costUsd: null,
      valueUsd: positiveMoney(value),
      pnlUsd: null,
      pnlPct: null,
      partial: true,
      partialLabel: "entry unknown",
      presentation: "holding",
    };
  }
  const full = !unexplained;
  const pnlUsd = full && value !== null ? money(value - cost) : null;
  return {
    sharesLabel,
    averageUsd: full ? cost / holdingUnits : null,
    costUsd: positiveMoney(cost),
    valueUsd: positiveMoney(value),
    pnlUsd: positiveMoney(pnlUsd),
    pnlPct: full && cost > 0 && value !== null ? ((value - cost) / cost) * 100 : null,
    partial: !full,
    partialLabel: full ? null : "partial",
    presentation: "known",
  };
}

export function rollupPositions(
  rows: readonly {
    ticker: string;
    ledger: LotsLedger;
    valueUsd: number | null;
    chart: PositionChart | null;
    /** Market value of shares that have no cost. Counts in value and marks the book partial. */
    unknownValueUsd?: number | null;
    /** Cost of an extra matched sleeve already included in valueUsd. */
    addedCostUsd?: number | null;
    /** Matched-sleeve cost. When set (including null), it replaces the ledger cost. */
    costUsd?: number | null;
  }[],
): PositionRollup {
  let cost = 0;
  let costCount = 0;
  let value = 0;
  let valueCount = 0;
  let knownValue = 0;
  let partial = false;
  const out: RollupRow[] = [];
  for (const row of rows) {
    const extra = typeof row.unknownValueUsd === "number" && row.unknownValueUsd > 0 ? row.unknownValueUsd : 0;
    const addedCost = typeof row.addedCostUsd === "number" && row.addedCostUsd > 0 ? row.addedCostUsd : 0;
    const matched = row.ledger.status === "matched" && row.ledger.costUsd !== null && row.valueUsd !== null;
    const displayValue =
      row.valueUsd === null ? (extra > 0 ? money(extra) : null) : money(row.valueUsd + extra);
    const rowCost =
      row.costUsd !== undefined
        ? row.costUsd
        : matched && row.ledger.costUsd !== null
          ? row.ledger.costUsd + addedCost
          : null;
    const known = rowCost !== null && row.valueUsd !== null;
    if (!known || extra > 0) partial = true;
    if (displayValue !== null) {
      value += displayValue;
      valueCount += 1;
    }
    if (known && rowCost !== null && row.valueUsd !== null) {
      cost += rowCost;
      costCount += 1;
      knownValue += row.valueUsd;
    }
    const pnlUsd = known && rowCost !== null && row.valueUsd !== null ? money(row.valueUsd - rowCost) : null;
    const pnlPct =
      known && rowCost !== null && rowCost > 0 && row.valueUsd !== null
        ? ((row.valueUsd - rowCost) / rowCost) * 100
        : null;
    out.push({
      ticker: row.ticker,
      costUsd: rowCost,
      valueUsd: displayValue,
      pnlUsd,
      pnlPct,
      partial: !known || extra > 0,
    });
  }
  const byDay = new Map<string, { value: number; cost: number; costParts: number }>();
  for (const row of rows) {
    const matched = row.ledger.status === "matched";
    for (const point of row.chart?.points ?? []) {
      const slot = byDay.get(point.day) ?? { value: 0, cost: 0, costParts: 0 };
      slot.value += point.valueUsd;
      if (matched && point.costUsd !== null) {
        slot.cost += point.costUsd;
        slot.costParts += 1;
      }
      byDay.set(point.day, slot);
    }
  }
  const points = [...byDay.entries()]
    .sort((left, right) => (left[0] < right[0] ? -1 : 1))
    .map(([day, slot]) => ({
      day,
      valueUsd: money(slot.value),
      costUsd: slot.costParts > 0 ? money(slot.cost) : null,
    }));
  const pnlUsd = costCount > 0 ? money(knownValue - cost) : null;
  const pnlPct = cost > 0 && pnlUsd !== null ? (pnlUsd / cost) * 100 : null;
  return {
    rows: out,
    costUsd: costCount > 0 ? money(cost) : null,
    valueUsd: valueCount > 0 ? money(value) : null,
    pnlUsd,
    pnlPct,
    partial: partial || (valueCount > 0 && costCount < valueCount),
    points,
  };
}

export function formatLotUsd(usd: number | null): string | null {
  if (usd === null || !Number.isFinite(usd)) return null;
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatLotPct(pct: number | null): string | null {
  if (pct === null) return null;
  return formatHomePct(pct);
}

export function formatSignedUsd(usd: number | null): string | null {
  const label = formatLotUsd(usd);
  if (!label || usd === null) return null;
  if (usd > 0) return `+${label}`;
  return label;
}

function sleeveQuantity(
  sleeves: readonly { id: string; quantity: string }[] | undefined,
  sleeve: string,
): string | null {
  const row = sleeves?.find((item) => item.id === sleeve);
  const quantity = row?.quantity.trim() ?? "";
  if (!isDecimalString(quantity) || Number(quantity) <= 0) return null;
  return quantity;
}

export type AgenticLotLine = {
  name: string;
  primary: string;
  secondary: string;
  valueUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
};

/**
 * Coinbase Agentic lots for one ticker.
 * XRP's seed is an uncosted transfer. It is the oldest lot, so a sell
 * reduces it and the remainder stays entry-unknown. SUI starts at 0, so a
 * buy is a normal costed lot.
 */
export function cbAgenticLotLines(input: {
  ticker: string;
  fills: readonly LedgerFill[];
  quantity: string | null;
  livePrice: number | null;
}): AgenticLotLine[] {
  const ticker = input.ticker.trim().toUpperCase();
  if (ticker !== "XRP" && ticker !== "SUI") return [];
  const current = positiveShares(input.quantity) ?? "0";
  const live = typeof input.livePrice === "number" && input.livePrice > 0 ? input.livePrice : null;
  const rows: { time: string; day: string; side: "buy" | "sell"; qty: string; price: string }[] = [];
  for (const fill of input.fills) {
    if (fill.kind === "bet") continue;
    if (fill.symbol.trim().toUpperCase() !== ticker) continue;
    if (fill.sleeve !== "cb-agentic") continue;
    if (fill.result && fill.result.trim().toLowerCase() !== "filled") continue;
    const side = fill.side;
    const qty = positiveQty(fill.quantity);
    const price = fill.price?.trim() ?? "";
    const day = sessionDay(fill.time);
    if ((side !== "buy" && side !== "sell") || !qty || !isDecimalString(price) || Number(price) <= 0 || !day) {
      continue;
    }
    rows.push({ time: fill.time, day, side, qty, price });
  }
  rows.sort((left, right) => Date.parse(left.time) - Date.parse(right.time));
  if (qtyCmp(current, "0") === 0 && rows.length === 0) return [];

  let bought = "0";
  let sold = "0";
  for (const row of rows) {
    if (row.side === "buy") bought = addDecimal(bought, row.qty);
    else sold = addDecimal(sold, row.qty);
  }
  const opened = subtractDecimal(addDecimal(current, sold), bought);
  const opening = qtyCmp(opened, "0") > 0 ? opened : "0";

  type Open =
    | { kind: "transfer"; original: string; remaining: string }
    | { kind: "buy"; day: string; original: string; remaining: string; price: string };
  const open: Open[] = [];
  if (qtyCmp(opening, "0") > 0) {
    open.push({ kind: "transfer", original: opening, remaining: opening });
  }
  for (const row of rows) {
    if (row.side === "buy") {
      open.push({ kind: "buy", day: row.day, original: row.qty, remaining: row.qty, price: row.price });
      continue;
    }
    let left = row.qty;
    for (const lot of open) {
      if (qtyCmp(left, "0") === 0) break;
      if (qtyCmp(lot.remaining, "0") === 0) continue;
      const take = qtyCmp(lot.remaining, left) <= 0 ? lot.remaining : left;
      lot.remaining = subtractDecimal(lot.remaining, take);
      left = subtractDecimal(left, take);
    }
  }

  const lines: AgenticLotLine[] = [];
  for (const lot of open) {
    if (qtyCmp(lot.remaining, "0") <= 0) continue;
    const value = live ? money(Number(lot.remaining) * live) : null;
    if (lot.kind === "transfer") {
      const reduced = qtyCmp(lot.remaining, lot.original) < 0;
      lines.push({
        name: "Coinbase Agentic",
        primary: reduced ? "Coinbase Agentic" : "Coinbase Agentic · entry unknown",
        secondary: reduced ? `entry unknown · ${lot.remaining} of ${lot.original}` : `${lot.remaining} shares`,
        valueUsd: value && value > 0 ? value : null,
        pnlUsd: null,
        pnlPct: null,
      });
      continue;
    }
    const entry = Number(lot.price);
    const pnlUsd = live ? money(Number(lot.remaining) * (live - entry)) : null;
    const pnlPct = live && entry > 0 ? ((live - entry) / entry) * 100 : null;
    const priceLabel = formatLotUsd(entry);
    lines.push({
      name: "Coinbase Agentic",
      primary: "Coinbase Agentic",
      secondary: `${lot.day} · ${lot.remaining} @ ${priceLabel ?? lot.price}`,
      valueUsd: value && value > 0 ? value : null,
      pnlUsd: pnlUsd && pnlUsd !== 0 ? pnlUsd : null,
      pnlPct: pnlUsd && pnlUsd !== 0 ? pnlPct : null,
    });
  }
  return lines;
}

export type SleeveLotBook = {
  id: LotSleeveId;
  name: string;
  ledger: LotsLedger;
  quantity: string;
};

function lotBooksFor(input: {
  fills: readonly LedgerFill[];
  ticker: string;
  sleeves: readonly { id: string; quantity: string }[] | undefined;
  livePrice: number | null;
}): SleeveLotBook[] {
  const books: SleeveLotBook[] = [];
  for (const id of LOT_SLEEVES) {
    const quantity = sleeveQuantity(input.sleeves, id);
    if (!quantity) continue;
    books.push({
      id,
      name: LOT_SLEEVE_LABEL[id],
      quantity,
      ledger: buildLotsLedger({
        fills: input.fills,
        ticker: input.ticker,
        sleeve: id,
        quantity,
        livePrice: input.livePrice,
      }),
    });
  }
  return books;
}

function bookExplained(ledger: LotsLedger): boolean {
  return ledger.status === "matched" && ledger.costUsd !== null && Number(ledger.openShares) > 0;
}

/** FIFO rows for the lots table. Coinbase Agentic stays on its own lines. */
export function displayLotBooks(
  books: readonly SleeveLotBook[],
  agenticVisible: boolean,
): { name: string | null; ledger: LotsLedger }[] {
  const listed = books.filter((book) => book.id !== "cb-agentic");
  const named = listed.length + (agenticVisible ? 1 : 0) > 1;
  return listed.map((book) => ({ name: named ? book.name : null, ledger: book.ledger }));
}

/** Chart, lots, and vault line for one child. A zero book has no position. */
export function assembleNodePosition(input: {
  fills: readonly LedgerFill[];
  ticker: string;
  sleeves: readonly { id: string; quantity: string }[] | undefined;
  priceUsd: number | null;
  closes: readonly DailyClose[];
  today: string;
  vaultQuantity?: string | null;
}): {
  ledger: LotsLedger;
  chart: PositionChart | null;
  quantity: string;
  vaultLine: string | null;
  /** Uncosted sleeve on this page. Null when that sleeve is absent or zero. */
  unknownLine: string | null;
  unknownShares: string | null;
  vaultShares: string | null;
  agenticLines: AgenticLotLine[];
  /** Positive rh-agentic, coinbase, and cb-agentic books. The vault is not a book. */
  books: SleeveLotBook[];
  /** Header token count: every sleeve quantity, including the vault. */
  holdingUnits: number;
  /** Cost of matched sleeves other than the chart sleeve. */
  addedCostUsd: number | null;
  /** A positive sleeve or the vault has no cost. */
  unexplained: boolean;
} | null {
  const sleeve = positionSleeve(input.ticker);
  if (!sleeve) return null;
  const live = typeof input.priceUsd === "number" && input.priceUsd > 0 ? input.priceUsd : null;
  const books = lotBooksFor({
    fills: input.fills,
    ticker: input.ticker,
    sleeves: input.sleeves,
    livePrice: live,
  });
  const primary = books.find((book) => book.id === sleeve);
  if (!primary) return null;
  const { ledger, quantity } = primary;
  const chart = buildPositionChart({
    ticker: input.ticker,
    ledger,
    closes: input.closes,
    quantity,
    today: input.today,
  });
  const vaultShares = positiveShares(
    input.vaultQuantity ?? input.sleeves?.find((row) => row.id === "flare-vault")?.quantity,
  );
  const agentic = books.find((book) => book.id === "cb-agentic");
  const agenticExplained = agentic ? bookExplained(agentic.ledger) : false;
  const unknownShares = agentic && !agenticExplained ? agentic.quantity : null;
  let added = 0;
  let unexplained = vaultShares !== null;
  for (const book of books) {
    if (bookExplained(book.ledger)) {
      if (book.id !== sleeve && book.ledger.costUsd !== null) added += book.ledger.costUsd;
      continue;
    }
    unexplained = true;
  }
  const xrp = input.ticker.trim().toUpperCase() === "XRP";
  return {
    ledger,
    chart,
    quantity,
    vaultLine: vaultUnknownLine(vaultShares),
    unknownLine: unknownShares && xrp ? xrpAgenticUnknownLine(input.ticker, input.sleeves) : null,
    unknownShares,
    vaultShares,
    agenticLines: cbAgenticLotLines({
      ticker: input.ticker,
      fills: input.fills,
      quantity: agentic?.quantity ?? null,
      livePrice: live,
    }),
    books,
    holdingUnits: totalSleeveQuantity(input.sleeves ?? []),
    addedCostUsd: added > 0 ? money(added) : null,
    unexplained,
  };
}

/** One row per child that has a positive sleeve quantity. Unmatched rows count as value only. */
export function rollupHoldingBooks(input: {
  tickers: readonly string[];
  fills: readonly LedgerFill[];
  sleeves: Readonly<Record<string, readonly { id: string; quantity: string }[] | undefined>>;
  prices: Readonly<Record<string, number | null | undefined>>;
  closes: Readonly<Record<string, readonly DailyClose[] | null | undefined>>;
  today: string;
}): PositionRollup {
  const rows: {
    ticker: string;
    ledger: LotsLedger;
    valueUsd: number | null;
    chart: PositionChart | null;
    unknownValueUsd: number | null;
    costUsd: number | null;
  }[] = [];
  for (const ticker of input.tickers) {
    const sleeve = positionSleeve(ticker);
    if (!sleeve) continue;
    const sleeves = input.sleeves[ticker];
    const quantity = sleeveQuantity(sleeves, sleeve);
    if (!quantity) continue;
    const price = input.prices[ticker];
    const live = typeof price === "number" && price > 0 ? price : null;
    const books = lotBooksFor({
      fills: input.fills,
      ticker,
      sleeves,
      livePrice: live,
    });
    const primary = books.find((book) => book.id === sleeve);
    if (!primary) continue;
    const chart = buildPositionChart({
      ticker,
      ledger: primary.ledger,
      closes: input.closes[ticker] ?? [],
      quantity,
      today: input.today,
    });
    let knownValue = 0;
    let knownCost = 0;
    let knownParts = 0;
    let unknownValue = 0;
    for (const book of books) {
      const market = live ? money(Number(book.quantity) * live) : null;
      if (bookExplained(book.ledger) && market !== null && book.ledger.costUsd !== null) {
        knownValue += market;
        knownCost += book.ledger.costUsd;
        knownParts += 1;
      } else if (market !== null) {
        unknownValue += market;
      }
    }
    const vaultQty = sleeveQuantity(sleeves, "flare-vault");
    if (vaultQty && live) unknownValue += money(Number(vaultQty) * live);
    rows.push({
      ticker,
      ledger: primary.ledger,
      valueUsd: knownParts > 0 ? money(knownValue) : null,
      chart,
      unknownValueUsd: unknownValue > 0 ? money(unknownValue) : null,
      costUsd: knownParts > 0 ? money(knownCost) : null,
    });
  }
  return rollupPositions(rows);
}
