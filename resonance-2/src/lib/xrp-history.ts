import "server-only";

import { xrpPricesFromMarketChart } from "@/lib/home-visuals";

const TTL_MS = 15 * 60 * 1000;
const URL = "https://api.coingecko.com/api/v3/coins/ripple/market_chart?vs_currency=usd&days=7";

type CacheEntry = {
  at: number;
  prices: number[];
};

let cache: CacheEntry | null = null;

async function fetchChart(): Promise<number[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(URL, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        accept: "application/json",
        "user-agent": "Resonance2/0.1",
      },
    });
    if (!response.ok) return [];
    return xrpPricesFromMarketChart(await response.json());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Seven-day XRP USD from CoinGecko. A failed read returns null so the spark stays hidden. */
export async function loadXrpWeek(): Promise<number[] | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.prices;
  const prices = await fetchChart();
  if (prices.length < 2) return null;
  cache = { at: Date.now(), prices };
  return prices;
}
