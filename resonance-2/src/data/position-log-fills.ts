/**
 * Confirmed Robinhood Agentic fills already inside the typed position seeds.
 *
 * HBAR seed `3846.51` is this one buy. Cost basis $438.01.
 * XLM seed `1910.31` is these two buys (1891.36 + 18.95). Cost basis $438.01
 * ($433.67 + $4.34).
 *
 * Ingest logs the rows and does not add the quantities again.
 * `notional` is the confirmed cash print. The fill store keeps qty and price.
 */
export const POSITION_LOG_FILLS = [
  {
    venue: "robinhood",
    orderId: "6abbe0d2-3966-4255-9e10-8c160f667d88",
    ticker: "HBAR",
    side: "buy",
    qty: "3846.51",
    price: "0.11387193",
    sleeve: "rh-agentic",
    filledAt: "2026-09-29T12:01:22-04:00",
    result: "filled",
    notional: "438.01",
  },
  {
    venue: "robinhood",
    orderId: "6abbe0e4-575c-4abe-a90e-90368b43a1b6",
    ticker: "XLM",
    side: "buy",
    qty: "1891.36",
    price: "0.22928558",
    sleeve: "rh-agentic",
    filledAt: "2026-09-29T12:01:40-04:00",
    result: "filled",
    notional: "433.67",
  },
  {
    venue: "robinhood",
    orderId: "6abbe113-41cb-4aa8-9e7c-0a986335b95a",
    ticker: "XLM",
    side: "buy",
    qty: "18.95",
    price: "0.2289895",
    sleeve: "rh-agentic",
    filledAt: "2026-09-29T12:02:27-04:00",
    result: "filled",
    notional: "4.34",
  },
] as const;

export function isPositionLogOrder(orderId: string): boolean {
  const key = orderId.trim().toLowerCase();
  return POSITION_LOG_FILLS.some((row) => row.orderId === key);
}
