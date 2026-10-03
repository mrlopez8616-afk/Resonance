/**
 * Confirmed Robinhood Agentic fills already inside the typed position seeds.
 *
 * HBAR seed `7847.91` is the 2026-09-29 buy plus the two 2026-10-01 buys.
 * Cost basis $851.06 ($438.01 + $409.10 + $3.95).
 * XLM is not a floor node and has no sleeve seed. The 2026-09-29 buys
 * (1891.36 + 18.95, cost basis $438.01) and the 2026-10-01 sell stay on
 * the operator log.
 *
 * Ingest logs the rows and does not add or subtract the quantities again.
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
  {
    venue: "robinhood",
    orderId: "6abed758-0215-4703-8d11-c412686df9be",
    ticker: "XLM",
    side: "sell",
    qty: "1910.31",
    price: "0.216176882",
    sleeve: "rh-agentic",
    filledAt: "2026-10-01T17:57:44-04:00",
    result: "filled",
    notional: "412.96",
  },
  {
    venue: "robinhood",
    orderId: "6abed771-773a-43df-9015-3bf44caf9938",
    ticker: "HBAR",
    side: "buy",
    qty: "3963.14",
    price: "0.10322475",
    sleeve: "rh-agentic",
    filledAt: "2026-10-01T17:58:10-04:00",
    result: "filled",
    notional: "409.10",
  },
  {
    venue: "robinhood",
    orderId: "6abed82c-87a4-49c7-9bd7-083c6a543efd",
    ticker: "HBAR",
    side: "buy",
    qty: "38.26",
    price: "0.10321862",
    sleeve: "rh-agentic",
    filledAt: "2026-10-01T18:01:16-04:00",
    result: "filled",
    notional: "3.95",
  },
] as const;

export function isPositionLogOrder(orderId: string): boolean {
  const key = orderId.trim().toLowerCase();
  return POSITION_LOG_FILLS.some((row) => row.orderId === key);
}
