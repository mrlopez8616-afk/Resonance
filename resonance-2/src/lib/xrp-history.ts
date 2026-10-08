import "server-only";

import {
  CRYPTO_BASKET_DAYS,
  dailyCloses,
  marketChartPoints,
  type DailyClose,
} from "@/lib/crypto-basket";

const TTL_MS = 15 * 60 * 1000;

/**
 * Live crypto faces that already have a CoinGecko id on the spot feed.
 * Offline coins are not fetched.
 */
const GECKO_IDS: Record<string, string> = {
  XRP: "ripple",
  SUI: "sui",
  HBAR: "hedera-hashgraph",
};

type CacheEntry = {
  at: number;
  closes: DailyClose[];
};

const cache = new Map<string, CacheEntry>();

async function fetchCloses(geckoId: string): Promise<DailyClose[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${geckoId}/market_chart?vs_currency=usd&days=${CRYPTO_BASKET_DAYS}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        accept: "application/json",
        "user-agent": "Resonance2/0.1",
      },
    });
    if (!response.ok) return [];
    return dailyCloses(marketChartPoints(await response.json()));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function loadTicker(ticker: string): Promise<DailyClose[]> {
  const geckoId = GECKO_IDS[ticker];
  if (!geckoId) return [];
  const hit = cache.get(geckoId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.closes;
  const closes = await fetchCloses(geckoId);
  if (closes.length === 0) return [];
  cache.set(geckoId, { at: Date.now(), closes });
  return closes;
}

/** Cached daily closes for the crypto basket. A failed coin is an empty list. */
export async function loadCryptoDailyCloses(
  tickers: readonly string[],
): Promise<Record<string, DailyClose[]>> {
  const unique = [...new Set(tickers)];
  const entries = await Promise.all(
    unique.map(async (ticker) => [ticker, await loadTicker(ticker)] as const),
  );
  return Object.fromEntries(entries);
}

/** Daily closes for every live crypto face the basket chart can price. */
export async function loadCryptoBasketCloses(): Promise<Record<string, DailyClose[]>> {
  return loadCryptoDailyCloses(Object.keys(GECKO_IDS));
}
