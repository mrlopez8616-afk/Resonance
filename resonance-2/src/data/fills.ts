export type FillSide = "buy" | "sell";

export type FillVenue = "robinhood" | "coinbase";

/** Writable sleeve prints. `flare-vault` is founder-typed and is not a FillSleeveId. */
export type FillSleeveId = "rh-main" | "rh-agentic" | "coinbase";

export type Fill = {
  time: string;
  symbol: string;
  side: FillSide;
  quantity: string;
  price: string;
  orderId: string;
  result: string;
  /** Present on hub-ingested rows. Seed samples may omit venue / sleeve. */
  venue?: FillVenue;
  tradeId?: string;
  sleeve?: FillSleeveId;
  idempotencyKey?: string;
  note?: string;
};

/**
 * Seed / local fallback for the operator log.
 * Production appends go through POST /api/fills (cabinet/fill-ingest.md).
 * Newest rows are shown first on `/log` (sorted by `time`).
 */
export const fills: Fill[] = [
  {
    time: "2026-09-18T11:48:58-05:00",
    symbol: "XRP",
    side: "sell",
    quantity: "10",
    price: "1.36756",
    orderId: "6aad6b7a-415a-4895-b43c-72c0eca79a55",
    result: "filled",
  },
  {
    time: "2026-09-18T11:49:18-05:00",
    symbol: "SUI",
    side: "buy",
    quantity: "16.931",
    price: "0.80729341",
    orderId: "6aad6b8e-f2a6-4be3-a803-65940a748d8d",
    result: "filled",
  },
];
