/**
 * Public Coinbase prices. No key. The spot route answers from US servers.
 * Daily candles are `[time, low, high, open, close, volume]` in seconds.
 */

export function coinbaseSpotUsd(body: unknown): number {
  if (typeof body !== "object" || body === null) throw new Error("Coinbase spot empty");
  const amount = (body as { data?: { amount?: unknown } }).data?.amount;
  const usd = typeof amount === "number" || typeof amount === "string" ? Number(amount) : Number.NaN;
  if (!Number.isFinite(usd) || usd <= 0) throw new Error("Coinbase spot returned no amount");
  return usd;
}

export function coinbaseDailyPrices(body: unknown): [number, number][] {
  if (!Array.isArray(body)) throw new Error("Coinbase chart empty");
  const prices: [number, number][] = [];
  for (const row of body) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const time = Number(row[0]);
    const close = Number(row[4]);
    if (!Number.isFinite(time) || !Number.isFinite(close) || close <= 0) continue;
    prices.push([time * 1000, close]);
  }
  prices.sort((left, right) => left[0] - right[0]);
  if (prices.length < 2) throw new Error("Coinbase chart returned no closes");
  return prices;
}
