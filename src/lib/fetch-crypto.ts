import { BINANCE_SYMBOLS, COINGECKO_IDS, CRYPTO_TICKERS, fetchWithTimeout } from "./price-ids";
import type { Quote } from "./types";

type CryptoResult = {
  source: string;
  quotes: Record<string, Quote>;
};

export async function fetchCryptoQuotes(): Promise<CryptoResult> {
  try {
    return await fetchCoinGecko();
  } catch (coingeckoError) {
    try {
      return await fetchBinance();
    } catch (binanceError) {
      const gecko =
        coingeckoError instanceof Error
          ? coingeckoError.message
          : "CoinGecko failed";
      const binance =
        binanceError instanceof Error ? binanceError.message : "Binance failed";
      throw new Error(`Crypto feeds unavailable. CoinGecko: ${gecko}. Binance: ${binance}.`);
    }
  }
}

async function fetchCoinGecko(): Promise<CryptoResult> {
  const ids = CRYPTO_TICKERS.map((ticker) => COINGECKO_IDS[ticker]).join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
  const response = await fetchWithTimeout(url, {
    headers: {
      accept: "application/json",
      "user-agent": "ResonanceDashboard/0.1",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = (await response.json()) as Record<
    string,
    { usd?: number; usd_24h_change?: number }
  >;
  const quotes: Record<string, Quote> = {};
  for (const ticker of CRYPTO_TICKERS) {
    const row = data[COINGECKO_IDS[ticker]];
    if (!row || typeof row.usd !== "number") continue;
    quotes[ticker] = {
      ticker,
      usd: row.usd,
      change24hPct:
        typeof row.usd_24h_change === "number" ? row.usd_24h_change : null,
    };
  }
  if (Object.keys(quotes).length === 0) {
    throw new Error("CoinGecko returned no quotes");
  }
  return { source: "CoinGecko", quotes };
}

async function fetchBinance(): Promise<CryptoResult> {
  const symbols = CRYPTO_TICKERS.map((ticker) => BINANCE_SYMBOLS[ticker]);
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(
    JSON.stringify(symbols),
  )}`;
  const response = await fetchWithTimeout(url, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = (await response.json()) as Array<{
    symbol: string;
    lastPrice: string;
    priceChangePercent: string;
  }>;
  const bySymbol = new Map(data.map((row) => [row.symbol, row]));
  const quotes: Record<string, Quote> = {};
  for (const ticker of CRYPTO_TICKERS) {
    const row = bySymbol.get(BINANCE_SYMBOLS[ticker]);
    if (!row) continue;
    const usd = Number(row.lastPrice);
    if (!Number.isFinite(usd)) continue;
    const change = Number(row.priceChangePercent);
    quotes[ticker] = {
      ticker,
      usd,
      change24hPct: Number.isFinite(change) ? change : null,
    };
  }
  if (Object.keys(quotes).length === 0) {
    throw new Error("Binance returned no quotes");
  }
  return { source: "Binance", quotes };
}
