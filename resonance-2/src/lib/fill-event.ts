import type { Fill, FillSide, FillSleeveId, FillVenue } from "@/data/fills";
import { isDecimalString } from "@/lib/decimal";

/** Locked 12. Never invent a ticker. */
export const LOCKED_TICKERS = [
  "BTC",
  "ETH",
  "SOL",
  "XRP",
  "SUI",
  "FLR",
  "PWR",
  "ETN",
  "VRT",
  "GEV",
  "CEG",
  "HUBB",
] as const;

export type LockedTicker = (typeof LOCKED_TICKERS)[number];

export const FILL_VENUES = ["robinhood", "coinbase"] as const;
export const WRITABLE_SLEEVE_IDS = ["rh-main", "rh-agentic", "coinbase"] as const;
export const FLARE_VAULT_SLEEVE_ID = "flare-vault";

export const VENUE_SLEEVES: Record<FillVenue, readonly FillSleeveId[]> = {
  robinhood: ["rh-main", "rh-agentic"],
  coinbase: ["coinbase"],
};

export class FillIngestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "FillIngestError";
    this.status = status;
  }
}

export type NormalizedFillEvent = {
  venue: FillVenue;
  orderId: string;
  tradeId?: string;
  ticker: LockedTicker;
  side: FillSide;
  qty: string;
  price: string;
  sleeve: FillSleeveId;
  filledAt: string;
  result: string;
  note?: string;
  idempotencyKey: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isLockedTicker(value: string): value is LockedTicker {
  return (LOCKED_TICKERS as readonly string[]).includes(value);
}

export function isFillVenue(value: string): value is FillVenue {
  return (FILL_VENUES as readonly string[]).includes(value);
}

export function isWritableSleeveId(value: string): value is FillSleeveId {
  return (WRITABLE_SLEEVE_IDS as readonly string[]).includes(value);
}

export function normalizeTradeKey(orderId: string, tradeId: string): string {
  return (orderId || tradeId).trim();
}

export function fillIdempotencyKey(venue: FillVenue, tradeKey: string): string {
  return `${venue}:${tradeKey.trim().toLowerCase()}`;
}

export function tradeKeysMatch(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function readTicker(raw: Record<string, unknown>): string {
  return asTrimmed(raw.ticker || raw.symbol).toUpperCase();
}

function readQty(raw: Record<string, unknown>): string {
  return asTrimmed(raw.qty || raw.quantity);
}

function readFilledAt(raw: Record<string, unknown>): string {
  return asTrimmed(raw.filledAt || raw.time);
}

function readSleeve(raw: Record<string, unknown>): string {
  return asTrimmed(raw.sleeve || raw.sleeveTarget || raw.sleeveId).toLowerCase();
}

export function extractFillBody(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) {
    throw new FillIngestError("JSON object is required.");
  }
  if (isRecord(body.fill)) return body.fill;
  return body;
}

export function parseFillEvent(body: unknown): NormalizedFillEvent {
  const raw = extractFillBody(body);
  const venueRaw = asTrimmed(raw.venue).toLowerCase();
  if (!isFillVenue(venueRaw)) {
    throw new FillIngestError("venue must be robinhood or coinbase.");
  }

  const orderId = asTrimmed(raw.orderId);
  const tradeId = asTrimmed(raw.tradeId);
  const tradeKey = normalizeTradeKey(orderId, tradeId);
  if (!tradeKey) {
    throw new FillIngestError("orderId or tradeId is required.");
  }

  const ticker = readTicker(raw);
  if (!isLockedTicker(ticker)) {
    throw new FillIngestError(
      "ticker must be one of the locked 12 nodes (BTC ETH SOL XRP SUI FLR PWR ETN VRT GEV CEG HUBB).",
    );
  }

  const sideRaw = asTrimmed(raw.side).toLowerCase();
  if (sideRaw !== "buy" && sideRaw !== "sell") {
    throw new FillIngestError("side must be buy or sell.");
  }

  const qty = readQty(raw);
  if (!isDecimalString(qty) || qty.startsWith("-") || Number(qty) <= 0) {
    throw new FillIngestError("qty must be a positive decimal string.");
  }

  const price = asTrimmed(raw.price);
  if (!isDecimalString(price) || price.startsWith("-")) {
    throw new FillIngestError("price must be a non-negative decimal string.");
  }

  const sleeveRaw = readSleeve(raw);
  if (sleeveRaw === FLARE_VAULT_SLEEVE_ID) {
    throw new FillIngestError(
      "flare-vault is founder-entered only and cannot be written by ingest.",
    );
  }
  if (!isWritableSleeveId(sleeveRaw)) {
    throw new FillIngestError("sleeve must be rh-main, rh-agentic, or coinbase.");
  }
  if (!VENUE_SLEEVES[venueRaw].includes(sleeveRaw)) {
    throw new FillIngestError(
      `sleeve ${sleeveRaw} is not valid for venue ${venueRaw}.`,
    );
  }

  const filledAt = readFilledAt(raw);
  if (!filledAt || Number.isNaN(Date.parse(filledAt))) {
    throw new FillIngestError("filledAt must be an ISO-8601 timestamp.");
  }

  const result = asTrimmed(raw.result) || "filled";
  const note = asTrimmed(raw.note) || undefined;

  return {
    venue: venueRaw,
    orderId: orderId || tradeKey,
    tradeId: tradeId || undefined,
    ticker,
    side: sideRaw,
    qty,
    price,
    sleeve: sleeveRaw,
    filledAt,
    result,
    note,
    idempotencyKey: fillIdempotencyKey(venueRaw, tradeKey),
  };
}

export function eventToFill(event: NormalizedFillEvent): Fill {
  return {
    time: event.filledAt,
    symbol: event.ticker,
    side: event.side,
    quantity: event.qty,
    price: event.price,
    orderId: event.orderId,
    result: event.result,
    venue: event.venue,
    tradeId: event.tradeId,
    sleeve: event.sleeve,
    idempotencyKey: event.idempotencyKey,
    note: event.note,
  };
}

export function fillMatchesEvent(fill: Fill, event: NormalizedFillEvent): boolean {
  if (fill.idempotencyKey && fill.idempotencyKey === event.idempotencyKey) {
    return true;
  }
  if (fill.orderId && tradeKeysMatch(fill.orderId, event.orderId)) {
    return true;
  }
  if (event.tradeId && fill.tradeId && tradeKeysMatch(fill.tradeId, event.tradeId)) {
    return true;
  }
  if (event.tradeId && fill.orderId && tradeKeysMatch(fill.orderId, event.tradeId)) {
    return true;
  }
  return false;
}
