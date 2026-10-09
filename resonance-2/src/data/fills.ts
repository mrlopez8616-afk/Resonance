export type FillSide = "buy" | "sell";

export type FillVenue = "robinhood" | "coinbase";

/** Coinbase Predict bets. Not a sleeve venue and not an ingest venue. */
export type BetVenue = "coinbase-predict";

/** Writable sleeve prints. `flare-vault` is founder-typed and is not a FillSleeveId. */
export type FillSleeveId = "rh-main" | "rh-agentic" | "coinbase" | "cb-agentic";

export type BetFillStatus = "open" | "won" | "lost" | "void" | "sold";

type FillBase = {
  time: string;
  symbol: string;
  orderId: string;
  result: string;
  tradeId?: string;
  idempotencyKey?: string;
  note?: string;
};

/** Sleeve fill. Buy and sell only. */
export type TradeFill = FillBase & {
  kind?: undefined;
  side: FillSide;
  quantity: string;
  price: string;
  /** Present on hub-ingested rows. Seed samples may omit venue / sleeve. */
  venue?: FillVenue;
  sleeve?: FillSleeveId;
  /**
   * The row is on the operator log only. The typed position seed already
   * includes this fill, so sleeve math must not run again.
   */
  logOnly?: boolean;
  /**
   * Historical replay (`backfill: true` or `historical: true` on POST).
   * The row is on the operator log and the capital calendar. Sleeve math
   * must not run. A later POST of the same order id dedupes.
   */
  backfill?: boolean;
};

/**
 * Founder bet on the operator log. Venue is Coinbase Predict, ticker is UFC.
 * Never applied to a crypto or equity sleeve.
 */
export type BetFill = FillBase & {
  kind: "bet";
  side?: undefined;
  quantity?: undefined;
  price?: undefined;
  venue: BetVenue;
  sleeve?: undefined;
  event: string;
  fight: string;
  fightSlug: string;
  pick: string;
  hubLean?: string;
  agreesWithLean?: boolean;
  stake: string;
  oddsPct: number;
  payout: string;
  betStatus: BetFillStatus;
  settledPayout?: string;
  realizedPnl?: string;
  settledAt?: string;
  estimated?: boolean;
  logOnly?: undefined;
  backfill?: undefined;
};

export type Fill = TradeFill | BetFill;

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
    venue: "robinhood",
    sleeve: "rh-agentic",
    idempotencyKey: "seed:6aad6b7a-415a-4895-b43c-72c0eca79a55",
  },
  {
    time: "2026-09-18T11:49:18-05:00",
    symbol: "SUI",
    side: "buy",
    quantity: "16.931",
    price: "0.80729341",
    orderId: "6aad6b8e-f2a6-4be3-a803-65940a748d8d",
    result: "filled",
    venue: "robinhood",
    sleeve: "rh-agentic",
    idempotencyKey: "seed:6aad6b8e-f2a6-4be3-a803-65940a748d8d",
  },
];
