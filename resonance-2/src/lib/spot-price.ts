import "server-only";

import type { SpotQuote } from "@/lib/live-face";

export const SPOT_TICKERS = ["XRP", "SUI"] as const;
export type SpotTicker = (typeof SPOT_TICKERS)[number];

const FEEDS: Record<
  SpotTicker,
  { geckoId: string; binanceSymbol: string }
> = {
  XRP: { geckoId: "ripple", binanceSymbol: "XRPUSDT" },
  SUI: { geckoId: "sui", binanceSymbol: "SUIUSDT" },
};

const TTL_MS = 30_000;

type CacheEntry = {
  at: number;
  quote: SpotQuote;
};

const cache = new Map<SpotTicker, CacheEntry>();

export function isSpotTicker(value: string): value is SpotTicker {
  return (SPOT_TICKERS as readonly string[]).includes(value);
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
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`;
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
    { usd?: number } | undefined
  >;
  const usd = data[geckoId]?.usd;
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) {
    throw new Error(`CoinGecko returned no ${ticker}-USD`);
  }
  return {
    usd,
    source: "CoinGecko",
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchBinance(ticker: SpotTicker): Promise<SpotQuote> {
  const { binanceSymbol } = FEEDS[ticker];
  const url = `https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`;
  const response = await fetchWithTimeout(url, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Binance HTTP ${response.status}`);
  }
  const data = (await response.json()) as { price?: string };
  const usd = Number(data.price);
  if (!Number.isFinite(usd) || usd <= 0) {
    throw new Error(`Binance returned no ${binanceSymbol}`);
  }
  return {
    usd,
    source: "Binance",
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Live spot USD from public feeds. CoinGecko → Binance fallback, same idea
 * as Phase Zero `src/lib/fetch-crypto.ts`. No broker keys.
 */
export async function fetchSpotUsd(ticker: SpotTicker): Promise<SpotQuote> {
  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return hit.quote;
  }

  try {
    const quote = await fetchCoinGecko(ticker);
    cache.set(ticker, { at: Date.now(), quote });
    return quote;
  } catch (coingeckoError) {
    try {
      const quote = await fetchBinance(ticker);
      cache.set(ticker, { at: Date.now(), quote });
      return quote;
    } catch (binanceError) {
      const gecko =
        coingeckoError instanceof Error
          ? coingeckoError.message
          : "CoinGecko failed";
      const binance =
        binanceError instanceof Error
          ? binanceError.message
          : "Binance failed";
      throw new Error(
        `${ticker}-USD feeds unavailable. CoinGecko: ${gecko}. Binance: ${binance}.`,
      );
    }
  }
}

export async function loadSpotQuote(
  ticker: SpotTicker,
): Promise<SpotQuote | null> {
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
