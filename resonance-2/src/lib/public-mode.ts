import { formatHomePct } from "@/lib/home-lines";

/** httpOnly cookie. `1` is public mode. Absent or anything else is private. */
export const PUBLIC_MODE_COOKIE = "__Host-resonance_public";

/**
 * The nine-node book. XRP is the treasury and is not in this list.
 * Order is the order cards paint.
 */
export const PUBLIC_BOOK = [
  { ticker: "SUI", id: "sui", parent: "crypto" },
  { ticker: "PWR", id: "pwr", parent: "ai-stocks" },
  { ticker: "VRT", id: "vrt", parent: "ai-stocks" },
  { ticker: "GEV", id: "gev", parent: "ai-stocks" },
  { ticker: "CEG", id: "ceg", parent: "ai-stocks" },
  { ticker: "NVDA", id: "nvda", parent: "ai-stocks" },
  { ticker: "TSM", id: "tsm", parent: "ai-stocks" },
  { ticker: "TSLA", id: "tsla", parent: "ai-stocks" },
  { ticker: "SPCX", id: "spcx", parent: "ai-stocks" },
] as const;

export type PublicBookTicker = (typeof PUBLIC_BOOK)[number]["ticker"];
export type PublicParentId = "crypto" | "ai-stocks";

export const TREASURY_LINE = "Powered by a digital asset treasury";

const BOOK_BY_TICKER = new Map(PUBLIC_BOOK.map((row) => [row.ticker, row]));

export function publicModeEnabled(value: string | null | undefined): boolean {
  return value === "1";
}

/**
 * Routes that stay off a shared screen.
 * `/n/build` and `/n/system` are not in this list: they stay visible.
 * Fight Desk itself stays; only the bankroll child is hidden.
 */
const HIDDEN_PREFIXES = [
  "/log",
  "/settings/security",
  "/n/finance",
  "/n/money",
  "/fights",
  "/api/finance",
  "/api/bets",
  "/api/fills",
  "/api/sleeves",
  "/api/spot-price",
  "/api/xrp-price",
  "/api/fights",
  "/api/settings/fitness-token",
  "/api/settings/owner-pin",
  "/n/approvals",
  "/api/approvals",
] as const;

export function isHiddenInPublicMode(pathname: string): boolean {
  const path = (pathname.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  if (path === "/n/fight-desk/bankroll") return true;
  return HIDDEN_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

const MONEY_TEXT =
  /\$\s?\d[\d,]*(?:\.\d+)?|\bUSD\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s*USD\b|\bUSD\b/gi;

export function hasMoneyText(value: string): boolean {
  return /\$\s?\d|\bUSD\b/i.test(value);
}

/** Drop dollar amounts. The leftover words stay. An amount-only string becomes empty. */
export function stripMoneyText(value: string): string {
  return value
    .replace(MONEY_TEXT, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

export function scrubTextFields<T extends { title: string; note?: string; location?: string }>(
  event: T,
): T {
  const title = stripMoneyText(event.title);
  return {
    ...event,
    title,
    note: event.note ? stripMoneyText(event.note) : event.note,
    location: event.location ? stripMoneyText(event.location) : event.location,
  };
}

/** A fight link would open a hidden route. Send that row to the calendar. */
export function publicHref(href: string): string {
  const path = href.split("?")[0] || href;
  return isHiddenInPublicMode(path) ? "/calendar" : href;
}

/**
 * Wins-losses only. A label that carries a dollar amount is not a public record.
 * `3-1 · 0 sold · 0 void` becomes `3-1`.
 */
export function publicRecordLabel(label: string | null | undefined): string | null {
  if (!label || hasMoneyText(label)) return null;
  const match = /^(\d+)-(\d+)\b/.exec(label.trim());
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

export type WeightShare = {
  ticker: string;
  /** Tenths of a percent. The shares of one book sum to 1000. */
  tenths: number;
};

/**
 * Current-value weights, one decimal, summing to 100.0%.
 * A non-positive value is left out. XRP is left out even when a value is passed.
 * Leftover tenths go to the largest remainder, then ticker, so the sum is exact.
 */
export function allocateTenths(
  rows: readonly { ticker: string; value: number }[],
): WeightShare[] {
  const usable = rows.filter(
    (row) => row.ticker !== "XRP" && Number.isFinite(row.value) && row.value > 0,
  );
  const total = usable.reduce((sum, row) => sum + row.value, 0);
  if (!(total > 0)) return [];
  const parts = usable.map((row) => {
    const exact = (row.value / total) * 1000;
    const base = Math.floor(exact + 1e-9);
    return { ticker: row.ticker, base, frac: exact - base };
  });
  let left = 1000 - parts.reduce((sum, row) => sum + row.base, 0);
  const order = [...parts].sort(
    (leftRow, rightRow) => rightRow.frac - leftRow.frac || leftRow.ticker.localeCompare(rightRow.ticker),
  );
  const bonus = new Map<string, number>();
  for (const row of order) {
    if (left <= 0) break;
    bonus.set(row.ticker, (bonus.get(row.ticker) ?? 0) + 1);
    left -= 1;
  }
  return parts.map((row) => ({
    ticker: row.ticker,
    tenths: row.base + (bonus.get(row.ticker) ?? 0),
  }));
}

export function formatTenths(tenths: number): string {
  return `${(tenths / 10).toFixed(1)}%`;
}

/** Price change from the first FIFO buy to the live price. Null when either price is missing. */
export function gainSinceFirstBuy(
  firstBuyPrice: number | null,
  livePrice: number | null,
): string | null {
  if (firstBuyPrice === null || livePrice === null) return null;
  if (!(firstBuyPrice > 0) || !(livePrice > 0)) return null;
  if (!Number.isFinite(firstBuyPrice) || !Number.isFinite(livePrice)) return null;
  return formatHomePct(((livePrice / firstBuyPrice) - 1) * 100);
}

export function firstBuyPriceFromMarkers(
  markers: readonly { side: string; price: string; time: string }[],
): number | null {
  const buys = markers.filter((marker) => marker.side === "buy");
  buys.sort((left, right) => left.time.localeCompare(right.time));
  const price = Number(buys[0]?.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export type DailyValue = {
  day: string;
  value: number;
  buy: boolean;
};

export type PublicSeriesPoint = {
  day: string;
  /** 100 on the first day. Later days are value relative to that base. */
  index: number;
  buy: boolean;
};

/** Rebase a value path to 100 at the first point. Fewer than two points is not a chart. */
export function indexFromValues(points: readonly DailyValue[]): PublicSeriesPoint[] {
  const clean = points.filter((point) => Number.isFinite(point.value) && point.value > 0);
  const base = clean[0]?.value;
  if (!base || clean.length < 2) return [];
  return clean.map((point) => ({
    day: point.day,
    index: (point.value / base) * 100,
    buy: point.buy,
  }));
}

/** Sum carried-forward daily values, then rebase. Adds land on the day they happen. */
export function combineIndexed(series: readonly (readonly DailyValue[])[]): PublicSeriesPoint[] {
  const maps = series.map((rows) => {
    const byDay = new Map<string, DailyValue>();
    for (const row of rows) byDay.set(row.day, row);
    return byDay;
  });
  const days = [...new Set(series.flatMap((rows) => rows.map((row) => row.day)))].sort();
  const carried: Array<number | null> = series.map(() => null);
  const combined: DailyValue[] = [];
  for (const day of days) {
    let sum = 0;
    let any = false;
    let buy = false;
    for (let index = 0; index < maps.length; index += 1) {
      const hit = maps[index]?.get(day);
      if (hit) {
        carried[index] = hit.value;
        if (hit.buy) buy = true;
      }
      const value = carried[index];
      if (value !== null && value !== undefined) {
        sum += value;
        any = true;
      }
    }
    if (any && sum > 0) combined.push({ day, value: sum, buy });
  }
  return indexFromValues(combined);
}

export function growthLabel(series: readonly PublicSeriesPoint[]): string | null {
  const last = series.at(-1)?.index;
  if (last === undefined || !Number.isFinite(last)) return null;
  return formatHomePct(last - 100);
}

export type PublicHoldingInput = {
  ticker: string;
  /** Current dollar value. Used to weight, then dropped. */
  value: number | null;
  firstBuyPrice: number | null;
  livePrice: number | null;
  daily: readonly DailyValue[];
};

export type PublicHolding = {
  id: string;
  ticker: string;
  weightLabel: string;
  gainLabel: string | null;
  series: PublicSeriesPoint[];
};

export type PublicGroup = {
  id: PublicParentId;
  label: string;
  weightLabel: string | null;
  growthLabel: string | null;
  series: PublicSeriesPoint[];
  holdings: PublicHolding[];
};

/** Public view of the book. Dollar inputs are not fields on the result. */
export type PublicFloorModel = {
  crypto: PublicGroup;
  aiStocks: PublicGroup;
  treasuryLabel: typeof TREASURY_LINE;
};

function groupOf(
  id: PublicParentId,
  label: string,
  holdings: PublicHolding[],
  tenths: number,
  inputs: readonly PublicHoldingInput[],
): PublicGroup {
  const tickers = new Set(holdings.map((holding) => holding.ticker));
  const series = combineIndexed(
    inputs.filter((input) => tickers.has(input.ticker)).map((input) => input.daily),
  );
  return {
    id,
    label,
    weightLabel: holdings.length > 0 ? formatTenths(tenths) : null,
    growthLabel: growthLabel(series),
    series,
    holdings,
  };
}

/**
 * Build the public book. Holdings without a positive value are omitted.
 * A missing first-buy price omits the gain line. XRP never appears.
 */
export function toPublicFloor(inputs: readonly PublicHoldingInput[]): PublicFloorModel {
  const byTicker = new Map(inputs.map((input) => [input.ticker.toUpperCase(), input]));
  const weighted = allocateTenths(
    PUBLIC_BOOK.map((row) => ({
      ticker: row.ticker,
      value: byTicker.get(row.ticker)?.value ?? 0,
    })),
  );
  const tenthsOf = new Map(weighted.map((row) => [row.ticker, row.tenths]));
  const holdings: PublicHolding[] = [];
  for (const row of PUBLIC_BOOK) {
    const tenths = tenthsOf.get(row.ticker);
    if (tenths === undefined) continue;
    const input = byTicker.get(row.ticker);
    holdings.push({
      id: row.id,
      ticker: row.ticker,
      weightLabel: formatTenths(tenths),
      gainLabel: input ? gainSinceFirstBuy(input.firstBuyPrice, input.livePrice) : null,
      series: indexFromValues(input?.daily ?? []),
    });
  }
  const crypto = holdings.filter((holding) => BOOK_BY_TICKER.get(holding.ticker as PublicBookTicker)?.parent === "crypto");
  const stocks = holdings.filter((holding) => BOOK_BY_TICKER.get(holding.ticker as PublicBookTicker)?.parent === "ai-stocks");
  const cryptoTenths = crypto.reduce((sum, holding) => sum + (tenthsOf.get(holding.ticker) ?? 0), 0);
  const stockTenths = stocks.reduce((sum, holding) => sum + (tenthsOf.get(holding.ticker) ?? 0), 0);
  return {
    crypto: groupOf("crypto", "Crypto", crypto, cryptoTenths, inputs),
    aiStocks: groupOf("ai-stocks", "AI Stocks", stocks, stockTenths, inputs),
    treasuryLabel: TREASURY_LINE,
  };
}

const BANNED_KEY = /usd|price|quantity|shares|qty|cost|balance|stake|amount|bankroll|token/i;

/** Keys and strings a public payload must not carry. */
export function publicPayloadLeaks(value: unknown, path = ""): string[] {
  if (typeof value === "string") {
    return hasMoneyText(value) ? [`${path || "value"}:${value}`] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => publicPayloadLeaks(item, `${path}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => {
      const here = path ? `${path}.${key}` : key;
      if (BANNED_KEY.test(key)) return [here];
      return publicPayloadLeaks(child, here);
    });
  }
  return [];
}

const LEAK_RULES: { id: string; pattern: RegExp }[] = [
  { id: "dollar", pattern: /\$\s?\d/ },
  { id: "usd", pattern: /\bUSD\b/ },
  { id: "shares", pattern: /\bshares?\b/i },
  { id: "quantity", pattern: /\bquantit(?:y|ies)\b/i },
  { id: "token", pattern: /\btokens?\b/i },
];

/** HTML / text scan for a public render. */
export function publicTextLeaks(text: string): string[] {
  return LEAK_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.id);
}
