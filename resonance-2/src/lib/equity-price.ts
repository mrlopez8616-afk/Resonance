import "server-only";

import {
  EQUITY_FACE_TICKERS,
  type SpotQuote,
} from "@/lib/live-face";

/**
 * Live equity USD. Mirrors Phase Zero `src/lib/fetch-equities.ts`:
 * Yahoo unofficial quote → Yahoo unofficial chart → Stooq.
 * Do not add these tickers to CoinGecko `SPOT_TICKERS`.
 */
export { EQUITY_FACE_TICKERS };
export type EquityFaceTicker = (typeof EQUITY_FACE_TICKERS)[number];

const TTL_MS = 30_000;
const YAHOO_UA =
  "Mozilla/5.0 (compatible; ResonanceDashboard/0.1; +https://github.com/mrlopez8616-afk/Resonance)";

type CacheEntry = {
  at: number;
  quote: SpotQuote;
};

const cache = new Map<EquityFaceTicker, CacheEntry>();

export function isEquityTicker(value: string): value is EquityFaceTicker {
  return (EQUITY_FACE_TICKERS as readonly string[]).includes(value);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 9000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

function asQuote(usd: number, source: string): SpotQuote {
  if (!Number.isFinite(usd) || usd <= 0) {
    throw new Error("Equity feed returned no USD");
  }
  return {
    usd,
    source,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchYahooQuote(ticker: EquityFaceTicker): Promise<SpotQuote> {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}`;
  const response = await fetchWithTimeout(url, {
    headers: {
      accept: "application/json",
      "user-agent": YAHOO_UA,
    },
  });
  if (!response.ok) {
    throw new Error(`Yahoo quote HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    quoteResponse?: {
      result?: Array<{
        symbol?: string;
        regularMarketPrice?: number;
      }>;
    };
  };
  const row = data.quoteResponse?.result?.find(
    (item) => (item.symbol ?? "").toUpperCase() === ticker,
  );
  const usd = row?.regularMarketPrice;
  if (typeof usd !== "number") {
    throw new Error("Yahoo quote returned no regularMarketPrice");
  }
  return asQuote(usd, "Yahoo Finance (unofficial public quote)");
}

async function fetchYahooChart(ticker: EquityFaceTicker): Promise<SpotQuote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`;
  const response = await fetchWithTimeout(url, {
    headers: {
      accept: "application/json",
      "user-agent": YAHOO_UA,
    },
  });
  if (!response.ok) {
    throw new Error(`Yahoo chart HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    chart?: {
      result?: Array<{
        meta?: { regularMarketPrice?: number };
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }>;
    };
  };
  const result = data.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const numeric = closes.filter(
    (value): value is number => typeof value === "number",
  );
  const last = numeric.at(-1);
  const usd =
    typeof last === "number" ? last : result?.meta?.regularMarketPrice;
  if (typeof usd !== "number") {
    throw new Error("Yahoo chart returned no close");
  }
  return asQuote(usd, "Yahoo Finance (unofficial chart)");
}

async function fetchStooq(ticker: EquityFaceTicker): Promise<SpotQuote> {
  const url = `https://stooq.com/q/l/?s=${ticker.toLowerCase()}.us&f=sd2t2ohlcv&h&e=csv`;
  const response = await fetchWithTimeout(url, {
    headers: { accept: "text/csv,text/plain" },
  });
  if (!response.ok) {
    throw new Error(`Stooq HTTP ${response.status}`);
  }
  const text = await response.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error("Stooq empty");
  }
  const close = Number(lines[1].split(",")[6]);
  if (!Number.isFinite(close) || close <= 0) {
    throw new Error("Stooq returned no close");
  }
  return asQuote(close, "Stooq");
}

/**
 * Live equity USD from unpaid public feeds. Same cascade as Phase Zero.
 * Weekend last-trade context stays in the cabinet — it is not returned
 * as a live print.
 */
export async function fetchEquityUsd(
  ticker: EquityFaceTicker,
): Promise<SpotQuote> {
  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return hit.quote;
  }

  const errors: string[] = [];
  for (const fetchFeed of [fetchYahooQuote, fetchYahooChart, fetchStooq]) {
    try {
      const quote = await fetchFeed(ticker);
      cache.set(ticker, { at: Date.now(), quote });
      return quote;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "failed");
    }
  }

  throw new Error(
    `${ticker}-USD equity feeds unavailable (not CoinGecko). ${errors.join(" · ")}.`,
  );
}

export async function loadEquityQuote(
  ticker: EquityFaceTicker,
): Promise<SpotQuote | null> {
  try {
    return await fetchEquityUsd(ticker);
  } catch {
    return null;
  }
}

export async function loadEquityQuotes(
  tickers: readonly EquityFaceTicker[],
): Promise<Record<EquityFaceTicker, SpotQuote | null>> {
  const entries = await Promise.all(
    tickers.map(async (ticker) => {
      const quote = await loadEquityQuote(ticker);
      return [ticker, quote] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<
    EquityFaceTicker,
    SpotQuote | null
  >;
}
