import "server-only";

import { HISTORY_FRESHNESS } from "@/lib/control-room";
import { dailyClosesFromYahooChart, datedClosesFromYahooChart } from "@/lib/equity-chart";
import { datedClosesFromMarketChart, xrpPricesFromMarketChart } from "@/lib/home-visuals";
import { quoteStatusLabel } from "@/lib/home-lines";
import type { EquityFaceTicker } from "@/lib/equity-price";
import { KRAKEN_PAIRS, krakenDailyPrices } from "@/lib/kraken-public";
import { readStoredCloses, writeStoredCloses } from "@/lib/market-quote-store";
import type { SpotTicker } from "@/lib/spot-price";
import { utcClosesFromMarketChart } from "@/lib/xrp-trigger";

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

type BodyEntry = {
  at: number;
  body: unknown | null;
  ttl: number;
  source: string | null;
  fetchedAt: string | null;
};

const cryptoBodies = new Map<string, BodyEntry>();
const cryptoBodyInflight = new Map<string, Promise<unknown | null>>();
const chartRetryNotBefore = new Map<string, number>();
/** A failed chart refresh waits before hitting the feeds again. The last body stays. */
const CHART_FAIL_MS = 60_000;
const XRP_CHART_KEY = "XRP:365";

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

function closesToBody(closes: readonly { day: string; close: number }[]): unknown {
  return {
    prices: closes.map((row) => [Date.parse(`${row.day}T00:00:00.000Z`), row.close] as [number, number]),
  };
}

function rememberChart(
  key: string,
  body: unknown,
  source: string,
  fetchedAt: string,
  ttl: number,
): void {
  const at = Date.parse(fetchedAt);
  cryptoBodies.set(key, {
    at: Number.isFinite(at) ? at : Date.now(),
    body,
    ttl,
    source,
    fetchedAt,
  });
}

async function fetchChartFeeds(
  ticker: SpotTicker,
  days: number,
): Promise<{ body: unknown; source: string; closes: { day: string; close: number }[] }> {
  const errors: string[] = [];
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${GECKO_IDS[ticker]}/market_chart?vs_currency=usd&days=${days}`;
    const response = await fetchWithTimeout(url, {
      headers: { accept: "application/json", "user-agent": "Resonance2/0.1" },
    });
    if (!response.ok) throw new Error(`CoinGecko HTTP ${response.status}`);
    const body: unknown = await response.json();
    const closes = utcClosesFromMarketChart(body);
    if (closes.length === 0) throw new Error("CoinGecko chart empty");
    return { body, source: "CoinGecko", closes };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "CoinGecko failed");
  }
  try {
    const url = `https://api.kraken.com/0/public/OHLC?pair=${KRAKEN_PAIRS[ticker]}&interval=1440`;
    const response = await fetchWithTimeout(url, {
      headers: { accept: "application/json", "user-agent": "Resonance2/0.1" },
    });
    if (!response.ok) throw new Error(`Kraken HTTP ${response.status}`);
    const body = { prices: krakenDailyPrices(await response.json()) };
    const closes = utcClosesFromMarketChart(body);
    if (closes.length === 0) throw new Error("Kraken chart empty");
    return { body, source: "Kraken", closes };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Kraken failed");
  }
  throw new Error(errors.join(". "));
}

/**
 * Shared year-chart body. `loadCryptoCloses` and the XRP trigger both read it,
 * so one warm process fetches a symbol once. CoinGecko first, then Kraken.
 * A failed refresh keeps the previous body.
 */
async function fetchCryptoMarketBody(ticker: SpotTicker, days: number): Promise<unknown | null> {
  const key = `${ticker}:${days}`;
  const now = Date.now();
  const hit = cryptoBodies.get(key);
  if (hit?.body && now - hit.at < hit.ttl) return hit.body;
  if (now < (chartRetryNotBefore.get(key) ?? 0)) return hit?.body ?? null;
  const pending = cryptoBodyInflight.get(key);
  if (pending) return pending;
  const promise = (async () => {
    try {
      const loaded = await fetchChartFeeds(ticker, days);
      const fetchedAt = new Date().toISOString();
      rememberChart(key, loaded.body, loaded.source, fetchedAt, HISTORY_TTL_MS);
      chartRetryNotBefore.delete(key);
      void writeStoredCloses(`chart:${key}`, {
        source: loaded.source,
        fetchedAt,
        closes: loaded.closes,
      });
      return loaded.body;
    } catch {
      chartRetryNotBefore.set(key, Date.now() + CHART_FAIL_MS);
      if (hit?.body) return hit.body;
      const stored = await readStoredCloses(`chart:${key}`);
      if (stored) {
        rememberChart(key, closesToBody(stored.closes), stored.source, stored.fetchedAt, HISTORY_TTL_MS);
        return cryptoBodies.get(key)?.body ?? null;
      }
      cryptoBodies.set(key, { at: Date.now(), body: null, ttl: MISS_TTL_MS, source: null, fetchedAt: null });
      return null;
    } finally {
      cryptoBodyInflight.delete(key);
    }
  })();
  cryptoBodyInflight.set(key, promise);
  return promise;
}

export function resetCryptoChartForTests(): void {
  cryptoBodies.clear();
  cryptoBodyInflight.clear();
  chartRetryNotBefore.clear();
}

/** Keep the last body and force the next read to miss the fresh window. */
export function expireCryptoChartForTests(): void {
  for (const [key, entry] of cryptoBodies) {
    cryptoBodies.set(key, { ...entry, at: 0, ttl: 0 });
  }
  chartRetryNotBefore.clear();
}

export function clearCryptoChartMemoryForTests(): void {
  cryptoBodies.clear();
  cryptoBodyInflight.clear();
  chartRetryNotBefore.clear();
}

async function fetchCryptoCloses(ticker: SpotTicker): Promise<{ day: string; close: number }[] | null> {
  const cached = readDated(cryptoDated, ticker);
  if (cached !== undefined) return cached;
  try {
    // Public CoinGecko rejects days=max (past 365 days only). A year of daily
    // closes is enough for the position chart.
    const body = await fetchCryptoMarketBody(ticker, 365);
    if (!body) throw new Error("CoinGecko chart missing");
    const closes = datedClosesFromMarketChart(body);
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

/**
 * When the trigger watch's year chart last succeeded.
 * The body stays in this module. Callers get a timestamp only.
 */
export function readXrpDailyCloseCache(nowMs: number): { fetchedAt: string; ageMs: number } | null {
  const hit = cryptoBodies.get(XRP_CHART_KEY);
  if (!hit?.body || !hit.fetchedAt) return null;
  const at = Date.parse(hit.fetchedAt);
  if (!Number.isFinite(at)) return null;
  return { fetchedAt: hit.fetchedAt, ageMs: nowMs - at };
}

function closesFromBody(body: unknown, fetchedAt: string, source: string) {
  const closes = utcClosesFromMarketChart(body);
  if (closes.length === 0) return null;
  return { closes, fetchedAt, source };
}

/**
 * Last good XRP daily closes. Does not call a price feed.
 * An in-flight page fetch is shared. Otherwise the stored print is used.
 */
export async function readSharedXrpTrigger(): Promise<{
  closes: { day: string; close: number }[];
  fetchedAt: string;
  source: string;
} | null> {
  const hit = cryptoBodies.get(XRP_CHART_KEY);
  if (hit?.body && hit.fetchedAt) {
    const parsed = closesFromBody(hit.body, hit.fetchedAt, hit.source ?? "cached");
    if (parsed) return parsed;
  }
  const pending = cryptoBodyInflight.get(XRP_CHART_KEY);
  if (pending) {
    const body = await pending;
    const cached = readXrpDailyCloseCache(Date.now());
    if (body && cached) {
      const parsed = closesFromBody(body, cached.fetchedAt, cryptoBodies.get(XRP_CHART_KEY)?.source ?? "cached");
      if (parsed) return parsed;
    }
  }
  const stored = await readStoredCloses(`chart:${XRP_CHART_KEY}`);
  if (!stored) return null;
  if (!cryptoBodies.get(XRP_CHART_KEY)?.body) {
    rememberChart(XRP_CHART_KEY, closesToBody(stored.closes), stored.source, stored.fetchedAt, HISTORY_TTL_MS);
  }
  return stored;
}

/**
 * Dated closes already fetched for a crypto node. Does not call a price feed.
 */
export async function readSharedCryptoCloses(
  ticker: SpotTicker,
): Promise<{ day: string; close: number }[] | null> {
  const key = `${ticker}:365`;
  const hit = cryptoBodies.get(key);
  if (hit?.body) {
    const closes = datedClosesFromMarketChart(hit.body);
    if (closes.length > 0) return closes;
  }
  const pending = cryptoBodyInflight.get(key);
  if (pending) {
    const body = await pending;
    if (body) {
      const closes = datedClosesFromMarketChart(body);
      if (closes.length > 0) return closes;
    }
  }
  const stored = await readStoredCloses(`chart:${key}`);
  return stored && stored.closes.length > 0 ? stored.closes : null;
}

/** Age label for a chart older than the trigger's fresh window. Null while it is fresh. */
export function xrpTriggerAgeLabel(now: Date): string | null {
  const cached = readXrpDailyCloseCache(now.getTime());
  if (!cached || cached.ageMs <= HISTORY_FRESHNESS.amberMs) return null;
  const label = quoteStatusLabel(cached.fetchedAt, now);
  return label.startsWith("stale") ? label : null;
}

/**
 * XRP daily closes for the trigger watch. Same year chart as
 * `loadCryptoCloses`, bucketed by UTC day. A failed refresh keeps the last
 * real closes. Null only when no feed and no stored print exists.
 */
export async function loadXrpTriggerCloses(): Promise<{ day: string; close: number }[] | null> {
  const body = await fetchCryptoMarketBody("XRP", 365);
  if (!body) return null;
  const closes = utcClosesFromMarketChart(body);
  return closes.length > 0 ? closes : null;
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
