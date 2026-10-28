import "server-only";

import type { SpotQuote } from "@/lib/live-face";
import { KRAKEN_PAIRS, krakenTickerUsd } from "@/lib/kraken-public";
import { readStoredSpot, writeStoredSpot } from "@/lib/market-quote-store";

export const SPOT_TICKERS = ["XRP", "SUI", "HBAR"] as const;
export type SpotTicker = (typeof SPOT_TICKERS)[number];

const FEEDS: Record<SpotTicker, { geckoId: string; binanceSymbol: string }> = {
  XRP: { geckoId: "ripple", binanceSymbol: "XRPUSDT" },
  SUI: { geckoId: "sui", binanceSymbol: "SUIUSDT" },
  HBAR: { geckoId: "hedera-hashgraph", binanceSymbol: "HBARUSDT" },
};

const TTL_MS = 30_000;
/** After every feed fails, serve the last good print and wait before trying again. */
const FAIL_WINDOW_MS = 15_000;

type CacheEntry = {
  at: number;
  quote: SpotQuote;
};

const cache = new Map<SpotTicker, CacheEntry>();
const inflight = new Map<SpotTicker, Promise<SpotQuote>>();
const retryNotBefore = new Map<SpotTicker, number>();

export function isSpotTicker(value: string): value is SpotTicker {
  return (SPOT_TICKERS as readonly string[]).includes(value);
}

export function resetSpotCacheForTests(): void {
  cache.clear();
  inflight.clear();
  retryNotBefore.clear();
}

/** Make the next read miss the fresh window without dropping the last price. */
export function expireSpotCacheForTests(): void {
  for (const [ticker, entry] of cache) cache.set(ticker, { ...entry, at: 0 });
  retryNotBefore.clear();
}

/** Cache age only. The price stays in this module. */
export function readSpotCache(
  ticker: SpotTicker,
  now = Date.now(),
): { fetchedAt: string; source: string; ageMs: number } | null {
  const hit = cache.get(ticker);
  if (!hit?.quote.fetchedAt || !hit.quote.source) return null;
  return { fetchedAt: hit.quote.fetchedAt, source: hit.quote.source, ageMs: now - hit.at };
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

async function fetchCoinGecko(ticker: SpotTicker): Promise<SpotQuote> {
  const { geckoId } = FEEDS[ticker];
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd&include_24hr_change=true`;
  const response = await fetchWithTimeout(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Resonance2/0.1",
    },
  });
  if (!response.ok) {
    throw new Error(`CoinGecko HTTP ${response.status}`);
  }
  const data = (await response.json()) as Record<
    string,
    { usd?: number; usd_24h_change?: number } | undefined
  >;
  const row = data[geckoId];
  const usd = row?.usd;
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) {
    throw new Error(`CoinGecko returned no ${ticker}-USD`);
  }
  const change = row?.usd_24h_change;
  return {
    usd,
    source: "CoinGecko",
    fetchedAt: new Date().toISOString(),
    change24hPct: typeof change === "number" && Number.isFinite(change) ? change : null,
    price24hAgoUsd: null,
  };
}

async function fetchKraken(ticker: SpotTicker): Promise<SpotQuote> {
  const pair = KRAKEN_PAIRS[ticker];
  const url = `https://api.kraken.com/0/public/Ticker?pair=${pair}`;
  const response = await fetchWithTimeout(url, {
    headers: { accept: "application/json", "user-agent": "Resonance2/0.1" },
  });
  if (!response.ok) throw new Error(`Kraken HTTP ${response.status}`);
  const usd = krakenTickerUsd(await response.json());
  return {
    usd,
    source: "Kraken",
    fetchedAt: new Date().toISOString(),
    change24hPct: null,
    price24hAgoUsd: null,
  };
}

async function fetchBinance(ticker: SpotTicker): Promise<SpotQuote> {
  const { binanceSymbol } = FEEDS[ticker];
  // 24hr ticker carries last price and the rolling change. The price-only
  // endpoint does not, so a fallback quote would otherwise drop 24h coverage.
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`;
  const response = await fetchWithTimeout(url, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Binance HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    lastPrice?: string;
    priceChangePercent?: string;
  };
  const usd = Number(data.lastPrice);
  if (!Number.isFinite(usd) || usd <= 0) {
    throw new Error(`Binance returned no ${binanceSymbol}`);
  }
  const rawChange = data.priceChangePercent;
  const change =
    typeof rawChange === "string" && rawChange.trim() !== ""
      ? Number(rawChange)
      : Number.NaN;
  return {
    usd,
    source: "Binance",
    fetchedAt: new Date().toISOString(),
    change24hPct: Number.isFinite(change) ? change : null,
    price24hAgoUsd: null,
  };
}

function remember(ticker: SpotTicker, quote: SpotQuote): void {
  cache.set(ticker, { at: Date.parse(quote.fetchedAt) || Date.now(), quote });
  retryNotBefore.delete(ticker);
  void writeStoredSpot(ticker, quote);
}

async function lastGood(ticker: SpotTicker): Promise<SpotQuote | null> {
  const hit = cache.get(ticker);
  if (hit) return hit.quote;
  const stored = await readStoredSpot(ticker);
  if (!stored) return null;
  cache.set(ticker, { at: Date.parse(stored.fetchedAt) || 0, quote: stored });
  return stored;
}

async function fetchSpotFresh(ticker: SpotTicker): Promise<SpotQuote> {
  const errors: string[] = [];
  for (const fetchFeed of [fetchCoinGecko, fetchKraken, fetchBinance]) {
    try {
      const quote = await fetchFeed(ticker);
      remember(ticker, quote);
      return quote;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "failed");
    }
  }
  retryNotBefore.set(ticker, Date.now() + FAIL_WINDOW_MS);
  const last = await lastGood(ticker);
  if (last) return last;
  throw new Error(`${ticker}-USD feeds unavailable. ${errors.join(". ")}.`);
}

/**
 * Live spot USD. CoinGecko, then Kraken, then Binance.
 * One in-flight fetch per symbol. A fresh print is reused for 30 seconds.
 * When every feed fails, the last real print is returned with its original time.
 */
export async function fetchSpotUsd(ticker: SpotTicker): Promise<SpotQuote> {
  const now = Date.now();
  const hit = cache.get(ticker);
  if (hit && now - hit.at < TTL_MS) return hit.quote;
  if (now < (retryNotBefore.get(ticker) ?? 0)) {
    const last = await lastGood(ticker);
    if (last) return last;
    throw new Error(`${ticker}-USD feeds unavailable.`);
  }
  const pending = inflight.get(ticker);
  if (pending) return pending;
  const promise = fetchSpotFresh(ticker).finally(() => {
    inflight.delete(ticker);
  });
  inflight.set(ticker, promise);
  return promise;
}

/**
 * Quote already fetched by a page. Does not call a price feed.
 * Memory first, then the stored last good print.
 */
export async function readSharedSpotQuote(ticker: SpotTicker): Promise<SpotQuote | null> {
  const hit = cache.get(ticker);
  if (hit) return hit.quote;
  const pending = inflight.get(ticker);
  if (pending) {
    try {
      return await pending;
    } catch {
      return lastGood(ticker);
    }
  }
  return lastGood(ticker);
}

export async function readSharedSpotQuotes(
  tickers: readonly SpotTicker[],
): Promise<Record<SpotTicker, SpotQuote | null>> {
  const entries = await Promise.all(
    tickers.map(async (ticker) => [ticker, await readSharedSpotQuote(ticker)] as const),
  );
  return Object.fromEntries(entries) as Record<SpotTicker, SpotQuote | null>;
}

export async function loadSpotQuote(ticker: SpotTicker): Promise<SpotQuote | null> {
  try {
    return await fetchSpotUsd(ticker);
  } catch {
    return null;
  }
}

export async function loadSpotQuotes(
  tickers: readonly SpotTicker[],
): Promise<Record<SpotTicker, SpotQuote | null>> {
  const entries = await Promise.all(
    tickers.map(async (ticker) => {
      const quote = await loadSpotQuote(ticker);
      return [ticker, quote] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<SpotTicker, SpotQuote | null>;
}
