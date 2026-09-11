import type { Quote } from "./types";

export const CRYPTO_TICKERS = ["BTC", "ETH", "SOL", "XRP", "SUI", "FLR"] as const;
export const EQUITY_TICKERS = ["PWR", "ETN", "VRT", "GEV", "CEG", "HUBB"] as const;

export const COINGECKO_IDS: Record<(typeof CRYPTO_TICKERS)[number], string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "ripple",
  SUI: "sui",
  FLR: "flare-networks",
};

export const BINANCE_SYMBOLS: Record<(typeof CRYPTO_TICKERS)[number], string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  SOL: "SOLUSDT",
  XRP: "XRPUSDT",
  SUI: "SUIUSDT",
  FLR: "FLRUSDT",
};

export async function fetchWithTimeout(
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

export function emptyQuotes(): Record<string, Quote> {
  return {};
}
