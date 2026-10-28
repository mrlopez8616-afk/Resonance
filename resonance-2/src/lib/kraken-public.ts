/** Public Kraken pairs. No key. These answer from US regions where Binance does not. */
export const KRAKEN_PAIRS = {
  XRP: "XRPUSD",
  SUI: "SUIUSD",
  HBAR: "HBARUSD",
} as const;

type KrakenTickerRow = { c?: unknown };

/**
 * Last trade price from a Kraken ticker body.
 * Today's open is not a 24h-ago price, so the change is left unset.
 */
export function krakenTickerUsd(body: unknown): number {
  if (typeof body !== "object" || body === null) {
    throw new Error("Kraken ticker empty");
  }
  const record = body as { error?: unknown; result?: Record<string, KrakenTickerRow> };
  if (Array.isArray(record.error) && record.error.length > 0) {
    throw new Error(`Kraken ${record.error.map(String).join(",")}`);
  }
  const row = record.result ? Object.values(record.result)[0] : undefined;
  const last = Array.isArray(row?.c) ? row.c[0] : undefined;
  const usd = typeof last === "number" || typeof last === "string" ? Number(last) : Number.NaN;
  if (!Number.isFinite(usd) || usd <= 0) throw new Error("Kraken ticker returned no last price");
  return usd;
}

/**
 * Daily OHLC closes as CoinGecko-shaped `[ms, usd]` points, oldest first.
 * Kraken times are seconds. The close is the fifth field. Invalid rows are dropped.
 */
export function krakenDailyPrices(body: unknown): [number, number][] {
  if (typeof body !== "object" || body === null) {
    throw new Error("Kraken chart empty");
  }
  const record = body as { error?: unknown; result?: Record<string, unknown> };
  if (Array.isArray(record.error) && record.error.length > 0) {
    throw new Error(`Kraken ${record.error.map(String).join(",")}`);
  }
  const rows = record.result
    ? Object.entries(record.result).find(([key]) => key !== "last")?.[1]
    : undefined;
  if (!Array.isArray(rows)) throw new Error("Kraken chart empty");
  const prices: [number, number][] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const time = Number(row[0]);
    const close = Number(row[4]);
    if (!Number.isFinite(time) || !Number.isFinite(close) || close <= 0) continue;
    prices.push([time * 1000, close]);
  }
  prices.sort((left, right) => left[0] - right[0]);
  if (prices.length < 2) throw new Error("Kraken chart returned no closes");
  return prices;
}
