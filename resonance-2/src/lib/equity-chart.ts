/**
 * Yahoo v8 chart day change.
 * `range=5d` sets `meta.chartPreviousClose` to the close before that window,
 * which is not yesterday. The prior session is the previous daily bar.
 */

const SESSION_TZ = "America/New_York";

export type YahooChartRange = "1d" | "5d" | "1mo";

export type YahooDayQuote = {
  usd: number;
  price24hAgoUsd: number | null;
  change24hPct: number | null;
};

type ChartResult = {
  meta?: {
    regularMarketPrice?: number;
    regularMarketTime?: number;
    chartPreviousClose?: number;
    previousClose?: number;
  };
  timestamp?: number[];
  indicators?: { quote?: Array<{ close?: Array<number | null> }> };
};

function chartResult(body: unknown): ChartResult | null {
  if (typeof body !== "object" || body === null) return null;
  const result = (body as { chart?: { result?: ChartResult[] } }).chart?.result?.[0];
  return result ?? null;
}

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Civil day of a Yahoo bar or `regularMarketTime`, in the US cash session zone. */
export function yahooSessionDay(unixSeconds: number): string | null {
  if (!Number.isFinite(unixSeconds)) return null;
  const date = new Date(unixSeconds * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SESSION_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

type SessionBar = { day: string | null; close: number };

function sessionBars(result: ChartResult): SessionBar[] {
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const stamps = result.timestamp ?? [];
  const bars: SessionBar[] = [];
  for (let index = 0; index < closes.length; index += 1) {
    const close = positive(closes[index]);
    if (close === null) continue;
    const stamp = stamps[index];
    bars.push({
      close,
      day: typeof stamp === "number" ? yahooSessionDay(stamp) : null,
    });
  }
  return bars;
}

/**
 * Live price and the prior session close.
 * When the last non-null bar falls on `regularMarketTime`'s session, that bar
 * is today (possibly partial) and yesterday is the bar before it. When the
 * last bar is an earlier session, that close is yesterday. `chartPreviousClose`
 * is used only for `range=1d`. Otherwise the fallback is `meta.previousClose`.
 */
export function quoteFromYahooChart(
  body: unknown,
  range: YahooChartRange = "5d",
): YahooDayQuote | null {
  const result = chartResult(body);
  if (!result) return null;
  const bars = sessionBars(result);
  const last = bars.at(-1) ?? null;
  const usd = positive(result.meta?.regularMarketPrice) ?? last?.close ?? null;
  if (usd === null) return null;

  const marketDay =
    typeof result.meta?.regularMarketTime === "number"
      ? yahooSessionDay(result.meta.regularMarketTime)
      : null;
  let ago: number | null = null;
  if (last && marketDay && last.day) {
    ago = last.day === marketDay ? (bars.length >= 2 ? bars[bars.length - 2]!.close : null) : last.close;
  } else if (bars.length >= 2) {
    ago = bars[bars.length - 2]!.close;
  }
  if (ago === null && range === "1d") ago = positive(result.meta?.chartPreviousClose);
  if (ago === null) ago = positive(result.meta?.previousClose);

  const change = ago !== null ? ((usd - ago) / ago) * 100 : null;
  return { usd, price24hAgoUsd: ago, change24hPct: change };
}

/** Daily closes, oldest first. Null and non-positive bars are dropped. */
export function dailyClosesFromYahooChart(body: unknown): number[] {
  const result = chartResult(body);
  if (!result) return [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const out: number[] = [];
  for (const value of closes) {
    const close = positive(value);
    if (close !== null) out.push(close);
  }
  return out;
}
