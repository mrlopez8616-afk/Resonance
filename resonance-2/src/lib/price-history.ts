import "server-only";

import { dailyClosesFromYahooChart, datedClosesFromYahooChart } from "@/lib/equity-chart";
import { datedClosesFromMarketChart, xrpPricesFromMarketChart } from "@/lib/home-visuals";
import type { EquityFaceTicker } from "@/lib/equity-price";
import type { SpotTicker } from "@/lib/spot-price";

/** History moves slower than the spot. A warm process reuses it. */
const HISTORY_TTL_MS = 15 * 60 * 1000;
const MISS_TTL_MS = 60 * 1000;

const GECKO_IDS: Record<SpotTicker, string> = {
  XRP: "ripple",
  SUI: "sui",
  HBAR: "hedera-hashgraph",
};

const YAHOO_UA =
  "Mozilla/5.0 (compatible; ResonanceDashboard/0.1; +https://github.com/mrlopez8616-afk/Resonance)";

type CacheEntry = {
  at: number;
  prices: number[] | null;
  ttl: number;
};

const cryptoCache = new Map<string, CacheEntry>();
const equityCache = new Map<string, CacheEntry>();

type DatedEntry = {
  at: number;
  closes: { day: string; close: number }[] | null;
  ttl: number;
};

const cryptoDated = new Map<string, DatedEntry>();
const equityDated = new Map<string, DatedEntry>();

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 9000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

function readCache(cache: Map<string, CacheEntry>, key: string): number[] | null | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at >= hit.ttl) return undefined;
  return hit.prices;
}

function writeCache(cache: Map<string, CacheEntry>, key: string, prices: number[] | null): void {
  cache.set(key, {
    at: Date.now(),
    prices,
    ttl: prices && prices.length >= 2 ? HISTORY_TTL_MS : MISS_TTL_MS,
  });
}

async function fetchCryptoHistory(ticker: SpotTicker): Promise<number[] | null> {
  const cached = readCache(cryptoCache, ticker);
  if (cached !== undefined) return cached;
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${GECKO_IDS[ticker]}/market_chart?vs_currency=usd&days=7`;
    const response = await fetchWithTimeout(url, {
      headers: { accept: "application/json", "user-agent": "Resonance2/0.1" },
    });
    if (!response.ok) throw new Error(`CoinGecko HTTP ${response.status}`);
    const prices = xrpPricesFromMarketChart(await response.json());
    const series = prices.length >= 2 ? prices : null;
    writeCache(cryptoCache, ticker, series);
    return series;
  } catch {
    writeCache(cryptoCache, ticker, null);
    return null;
  }
}

async function fetchEquityHistory(ticker: EquityFaceTicker): Promise<number[] | null> {
  const cached = readCache(equityCache, ticker);
  if (cached !== undefined) return cached;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1mo`;
    const response = await fetchWithTimeout(url, {
      headers: { accept: "application/json", "user-agent": YAHOO_UA },
    });
    if (!response.ok) throw new Error(`Yahoo chart HTTP ${response.status}`);
    const prices = dailyClosesFromYahooChart(await response.json());
    const series = prices.length >= 2 ? prices : null;
    writeCache(equityCache, ticker, series);
    return series;
  } catch {
    writeCache(equityCache, ticker, null);
    return null;
  }
}

export async function loadCryptoHistory(
  tickers: readonly SpotTicker[],
): Promise<Record<string, number[] | null>> {
  const entries = await Promise.all(
    tickers.map(async (ticker) => [ticker, await fetchCryptoHistory(ticker)] as const),
  );
  return Object.fromEntries(entries);
}

function readDated(cache: Map<string, DatedEntry>, key: string): { day: string; close: number }[] | null | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at >= hit.ttl) return undefined;
  return hit.closes;
}

function writeDated(
  cache: Map<string, DatedEntry>,
  key: string,
  closes: { day: string; close: number }[] | null,
): void {
  cache.set(key, {
    at: Date.now(),
    closes,
    ttl: closes && closes.length >= 2 ? HISTORY_TTL_MS : MISS_TTL_MS,
  });
}

async function fetchCryptoCloses(ticker: SpotTicker): Promise<{ day: string; close: number }[] | null> {
  const cached = readDated(cryptoDated, ticker);
  if (cached !== undefined) return cached;
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${GECKO_IDS[ticker]}/market_chart?vs_currency=usd&days=max`;
    const response = await fetchWithTimeout(url, {
      headers: { accept: "application/json", "user-agent": "Resonance2/0.1" },
    });
    if (!response.ok) throw new Error(`CoinGecko HTTP ${response.status}`);
    const closes = datedClosesFromMarketChart(await response.json());
    const series = closes.length >= 2 ? closes : null;
    writeDated(cryptoDated, ticker, series);
    return series;
  } catch {
    writeDated(cryptoDated, ticker, null);
    return null;
  }
}

async function fetchEquityCloses(ticker: string): Promise<{ day: string; close: number }[] | null> {
  const cached = readDated(equityDated, ticker);
  if (cached !== undefined) return cached;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5y`;
    const response = await fetchWithTimeout(url, {
      headers: { accept: "application/json", "user-agent": YAHOO_UA },
    });
    if (!response.ok) throw new Error(`Yahoo chart HTTP ${response.status}`);
    const closes = datedClosesFromYahooChart(await response.json());
    const series = closes.length >= 2 ? closes : null;
    writeDated(equityDated, ticker, series);
    return series;
  } catch {
    writeDated(equityDated, ticker, null);
    return null;
  }
}

export async function loadCryptoCloses(
  tickers: readonly SpotTicker[],
): Promise<Record<string, { day: string; close: number }[] | null>> {
  const entries = await Promise.all(
    tickers.map(async (ticker) => [ticker, await fetchCryptoCloses(ticker)] as const),
  );
  return Object.fromEntries(entries);
}

export async function loadEquityCloses(
  tickers: readonly string[],
): Promise<Record<string, { day: string; close: number }[] | null>> {
  const entries = await Promise.all(
    tickers.map(async (ticker) => [ticker, await fetchEquityCloses(ticker)] as const),
  );
  return Object.fromEntries(entries);
}

export async function loadEquityHistory(
  tickers: readonly EquityFaceTicker[],
): Promise<Record<string, number[] | null>> {
  const entries = await Promise.all(
    tickers.map(async (ticker) => [ticker, await fetchEquityHistory(ticker)] as const),
  );
  return Object.fromEntries(entries);
}
