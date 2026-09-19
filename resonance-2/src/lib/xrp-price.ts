import "server-only";

import type { XrpQuote } from "@/lib/xrp-face";

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd";
const BINANCE_URL = "https://api.binance.com/api/v3/ticker/price?symbol=XRPUSDT";

const TTL_MS = 30_000;

type CacheEntry = {
  at: number;
  quote: XrpQuote;
};

let cache: CacheEntry | null = null;

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

async function fetchCoinGecko(): Promise<XrpQuote> {
  const response = await fetchWithTimeout(COINGECKO_URL, {
    headers: {
      accept: "application/json",
      "user-agent": "Resonance2/0.1",
    },
  });
  if (!response.ok) {
    throw new Error(`CoinGecko HTTP ${response.status}`);
  }
  const data = (await response.json()) as { ripple?: { usd?: number } };
  const usd = data.ripple?.usd;
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) {
    throw new Error("CoinGecko returned no XRP-USD");
  }
  return {
    usd,
    source: "CoinGecko",
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchBinance(): Promise<XrpQuote> {
  const response = await fetchWithTimeout(BINANCE_URL, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Binance HTTP ${response.status}`);
  }
  const data = (await response.json()) as { price?: string };
  const usd = Number(data.price);
  if (!Number.isFinite(usd) || usd <= 0) {
    throw new Error("Binance returned no XRPUSDT");
  }
  return {
    usd,
    source: "Binance",
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Live XRP-USD from public spot feeds. Same CoinGecko → Binance fallback
 * as the Phase Zero `/api/prices` helper, scoped to XRP only. No broker keys.
 */
export async function fetchXrpUsd(): Promise<XrpQuote> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return cache.quote;
  }

  try {
    const quote = await fetchCoinGecko();
    cache = { at: Date.now(), quote };
    return quote;
  } catch (coingeckoError) {
    try {
      const quote = await fetchBinance();
      cache = { at: Date.now(), quote };
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
        `XRP-USD feeds unavailable. CoinGecko: ${gecko}. Binance: ${binance}.`,
      );
    }
  }
}

export async function loadXrpQuote(): Promise<XrpQuote | null> {
  try {
    return await fetchXrpUsd();
  } catch {
    return null;
  }
}
