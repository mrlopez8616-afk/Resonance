import type { Fill, FillSide, FillSleeveId, FillVenue, RewardFill, TradeFill, TransferFill } from "@/data/fills";
import { POSITION_LOG_FILLS } from "@/data/position-log-fills";
import { AI_STOCK_TICKERS, RETIRED_AI_TICKERS } from "@/lib/ai-stocks";
import { isDecimalString } from "@/lib/decimal";

/** Active nodes. Never invent a ticker. Append only. */
export const LOCKED_TICKERS = [
  "BTC",
  "ETH",
  "SOL",
  "XRP",
  "SUI",
  "FLR",
  ...AI_STOCK_TICKERS,
  "HBAR",
] as const;

export type LockedTicker = (typeof LOCKED_TICKERS)[number];

/** Still accepted so a closing sell can zero the sleeve. Not an active child. */
export const RETIRED_FILL_TICKERS = RETIRED_AI_TICKERS;

export const ACCEPTED_FILL_TICKERS = [...LOCKED_TICKERS, ...RETIRED_FILL_TICKERS] as const;

export type AcceptedFillTicker = (typeof ACCEPTED_FILL_TICKERS)[number];

/**
 * Symbols that remain on stored fills after the node left the floor.
 * Not a floor node, sleeve seed, or spot ticker.
 */
export type HistoricalFillTicker = Exclude<
  (typeof POSITION_LOG_FILLS)[number]["ticker"],
  LockedTicker
>;

export type FillSymbol = AcceptedFillTicker | HistoricalFillTicker;

export const FILL_VENUES = ["robinhood", "coinbase"] as const;
export const WRITABLE_SLEEVE_IDS = ["rh-main", "rh-agentic", "coinbase", "cb-agentic"] as const;
export const FLARE_VAULT_SLEEVE_ID = "flare-vault";

export const VENUE_SLEEVES: Record<FillVenue, readonly FillSleeveId[]> = {
  robinhood: ["rh-main", "rh-agentic"],
  coinbase: ["coinbase", "cb-agentic"],
};

export class FillIngestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "FillIngestError";
    this.status = status;
  }
}

export type NormalizedTradeEvent = {
  kind?: undefined;
  venue: FillVenue;
  orderId: string;
  tradeId?: string;
  ticker: FillSymbol;
  side: FillSide;
  qty: string;
  price: string;
  sleeve: FillSleeveId;
  filledAt: string;
  result: string;
  note?: string;
  /** USD fee from the POST body. The fills table has no fee column, so this stays on the payload. */
  feeUsd?: string;
  /** Set when the POST body sent `backfill: true` or `historical: true`. */
  backfill?: boolean;
  idempotencyKey: string;
};

/** Internal sleeve move. No price, no side, and no backfill. */
export type NormalizedTransferEvent = {
  kind: "transfer";
  venue: FillVenue;
  orderId: string;
  tradeId?: string;
  ticker: FillSymbol;
  side?: undefined;
  qty: string;
  price?: undefined;
  sleeve?: undefined;
  fromSleeve: FillSleeveId;
  toSleeve: FillSleeveId;
  filledAt: string;
  result: string;
  note?: string;
  feeUsd?: undefined;
  backfill?: undefined;
  idempotencyKey: string;
};

/** Founder yield. No price, no cost, and not a buy. */
export type NormalizedRewardEvent = {
  kind: "reward";
  venue: "manual";
  orderId: string;
  ticker: "XRP";
  side?: undefined;
  qty: string;
  price?: undefined;
  sleeve: "flare-vault";
  filledAt: string;
  result: string;
  note?: string;
  feeUsd?: undefined;
  backfill?: undefined;
  idempotencyKey: string;
};

export type NormalizedFillEvent = NormalizedTradeEvent | NormalizedTransferEvent | NormalizedRewardEvent;

/** `manual:reward:flare-vault:xrp:YYYY-MM-DDThh:mm` lowercased, minute precision. */
export function rewardIdempotencyKey(filledAt: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/i.exec(filledAt.trim());
  if (!match) return "";
  return `manual:reward:flare-vault:xrp:${match[1]}t${match[2]}`.toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isLockedTicker(value: string): value is LockedTicker {
  return (LOCKED_TICKERS as readonly string[]).includes(value);
}

export function isAcceptedFillTicker(value: string): value is AcceptedFillTicker {
  return (ACCEPTED_FILL_TICKERS as readonly string[]).includes(value);
}

export function isHistoricalFillTicker(value: string): value is HistoricalFillTicker {
  if (isLockedTicker(value)) return false;
  return POSITION_LOG_FILLS.some((row) => row.ticker === value);
}

export function isFillSymbol(value: string): value is FillSymbol {
  return isAcceptedFillTicker(value) || isHistoricalFillTicker(value);
}

/** The known position-log rows whose ticker is no longer a floor node. */
export function isRetainedLogFill(
  orderId: string,
  ticker: string,
): ticker is HistoricalFillTicker {
  if (!isHistoricalFillTicker(ticker)) return false;
  const key = orderId.trim().toLowerCase();
  return POSITION_LOG_FILLS.some(
    (row) => row.orderId === key && row.ticker === ticker,
  );
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

function assertWritableVenueSleeve(venue: FillVenue, sleeveRaw: string, field: string): FillSleeveId {
  if (sleeveRaw === FLARE_VAULT_SLEEVE_ID) {
    throw new FillIngestError(
      "flare-vault is founder-entered only and cannot be written by ingest.",
    );
  }
  if (!isWritableSleeveId(sleeveRaw)) {
    throw new FillIngestError(`${field} must be rh-main, rh-agentic, coinbase, or cb-agentic.`);
  }
  if (!VENUE_SLEEVES[venue].includes(sleeveRaw)) {
    throw new FillIngestError(`sleeve ${sleeveRaw} is not valid for venue ${venue}.`);
  }
  return sleeveRaw;
}

/** `fee` or `feeUsd`, as a non-negative decimal string. Absent means no fee was sent. */
function readFeeUsd(raw: Record<string, unknown>): string | undefined {
  const fee = raw.feeUsd ?? raw.fee;
  if (fee == null || fee === "") return undefined;
  const text = typeof fee === "string" ? fee.trim() : "";
  if (!isDecimalString(text) || text.startsWith("-")) {
    throw new FillIngestError("fee must be a non-negative decimal string.");
  }
  return text;
}

function readBackfill(
  raw: Record<string, unknown>,
  outer: Record<string, unknown> | null,
): boolean {
  if (raw.backfill === true || raw.historical === true) return true;
  if (outer && outer !== raw) {
    return outer.backfill === true || outer.historical === true;
  }
  return false;
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
  const outer = isRecord(body) ? body : null;
  const kindRaw = asTrimmed(raw.kind).toLowerCase();
  const sideRaw = asTrimmed(raw.side).toLowerCase();
  if (kindRaw === "reward" || sideRaw === "reward") {
    if (kindRaw && kindRaw !== "reward") {
      throw new FillIngestError("kind must be reward.");
    }
    if (sideRaw && sideRaw !== "reward") {
      throw new FillIngestError("a reward cannot include a trade side.");
    }
    return parseRewardEvent(raw, outer);
  }
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
  let symbol: FillSymbol;
  if (isAcceptedFillTicker(ticker)) {
    symbol = ticker;
  } else if (isRetainedLogFill(orderId || tradeKey, ticker)) {
    symbol = ticker;
  } else {
    throw new FillIngestError(
      `ticker must be one of the locked nodes (${LOCKED_TICKERS.join(" ")}) or a retiring book (${RETIRED_FILL_TICKERS.join(" ")}).`,
    );
  }

  if (kindRaw === "transfer" || sideRaw === "transfer") {
    if (kindRaw && kindRaw !== "transfer") {
      throw new FillIngestError("kind must be transfer.");
    }
    if (sideRaw && sideRaw !== "transfer") {
      throw new FillIngestError("a transfer cannot include a trade side.");
    }
    return parseTransferEvent(raw, outer, venueRaw, orderId, tradeId, tradeKey, symbol);
  }
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

  const sleeveRaw = assertWritableVenueSleeve(venueRaw, readSleeve(raw), "sleeve");

  const filledAt = readFilledAt(raw);
  if (!filledAt || Number.isNaN(Date.parse(filledAt))) {
    throw new FillIngestError("filledAt must be an ISO-8601 timestamp.");
  }

  const result = asTrimmed(raw.result) || "filled";
  const note = asTrimmed(raw.note) || undefined;
  const feeUsd = readFeeUsd(raw);
  const backfill = readBackfill(raw, outer);

  return {
    venue: venueRaw,
    orderId: orderId || tradeKey,
    tradeId: tradeId || undefined,
    ticker: symbol,
    side: sideRaw,
    qty,
    price,
    sleeve: sleeveRaw,
    filledAt,
    result,
    note,
    ...(feeUsd ? { feeUsd } : {}),
    ...(backfill ? { backfill: true as const } : {}),
    idempotencyKey: fillIdempotencyKey(venueRaw, tradeKey),
  };
}

function parseRewardEvent(
  raw: Record<string, unknown>,
  outer: Record<string, unknown> | null,
): NormalizedRewardEvent {
  if (readBackfill(raw, outer)) {
    throw new FillIngestError("backfill is not valid for a reward.");
  }
  const venueRaw = asTrimmed(raw.venue).toLowerCase();
  if (venueRaw && venueRaw !== "manual") {
    throw new FillIngestError("a reward venue is manual.");
  }
  const price = asTrimmed(raw.price);
  if (price) {
    throw new FillIngestError("a reward has no price.");
  }
  const sleeveRaw = readSleeve(raw);
  if (sleeveRaw !== FLARE_VAULT_SLEEVE_ID) {
    throw new FillIngestError("a reward sleeve is flare-vault.");
  }
  const ticker = readTicker(raw);
  if (ticker !== "XRP") {
    throw new FillIngestError("a vault reward ticker is XRP.");
  }
  const qty = readQty(raw);
  if (!isDecimalString(qty) || qty.startsWith("-") || Number(qty) <= 0) {
    throw new FillIngestError("qty must be a positive decimal string.");
  }
  const filledAt = readFilledAt(raw);
  if (!filledAt || Number.isNaN(Date.parse(filledAt))) {
    throw new FillIngestError("filledAt must be an ISO-8601 timestamp.");
  }
  const idempotencyKey = rewardIdempotencyKey(filledAt);
  if (!idempotencyKey) {
    throw new FillIngestError("filledAt must include a calendar minute.");
  }
  const providedKey = asTrimmed(raw.idempotencyKey);
  if (!providedKey) {
    throw new FillIngestError("idempotencyKey is required for a reward.");
  }
  if (providedKey.toLowerCase() !== idempotencyKey) {
    throw new FillIngestError("idempotencyKey must match the vault reward minute.");
  }
  const minute = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/i.exec(filledAt.trim());
  const orderId = asTrimmed(raw.orderId) || `reward:flare-vault:XRP:${minute?.[1]}T${minute?.[2]}`;
  const result = asTrimmed(raw.result) || "filled";
  const note = asTrimmed(raw.note) || undefined;
  return {
    kind: "reward",
    venue: "manual",
    orderId,
    ticker: "XRP",
    qty,
    sleeve: "flare-vault",
    filledAt,
    result,
    note,
    idempotencyKey,
  };
}

function parseTransferEvent(
  raw: Record<string, unknown>,
  outer: Record<string, unknown> | null,
  venueRaw: FillVenue,
  orderId: string,
  tradeId: string,
  tradeKey: string,
  symbol: FillSymbol,
): NormalizedTransferEvent {
  if (readBackfill(raw, outer)) {
    throw new FillIngestError("backfill is not valid for a transfer.");
  }
  const providedKey = asTrimmed(raw.idempotencyKey);
  if (!providedKey) {
    throw new FillIngestError("idempotencyKey is required for a transfer.");
  }
  const idempotencyKey = fillIdempotencyKey(venueRaw, tradeKey);
  if (providedKey.toLowerCase() !== idempotencyKey) {
    throw new FillIngestError("idempotencyKey must match the venue and trade key.");
  }

  const qty = readQty(raw);
  if (!isDecimalString(qty) || qty.startsWith("-") || Number(qty) <= 0) {
    throw new FillIngestError("qty must be a positive decimal string.");
  }

  const fromSleeve = assertWritableVenueSleeve(
    venueRaw,
    asTrimmed(raw.fromSleeve).toLowerCase(),
    "fromSleeve",
  );
  const toSleeve = assertWritableVenueSleeve(
    venueRaw,
    asTrimmed(raw.toSleeve).toLowerCase(),
    "toSleeve",
  );
  if (fromSleeve === toSleeve) {
    throw new FillIngestError("fromSleeve and toSleeve must be different.");
  }

  const filledAt = readFilledAt(raw);
  if (!filledAt || Number.isNaN(Date.parse(filledAt))) {
    throw new FillIngestError("filledAt must be an ISO-8601 timestamp.");
  }

  const result = asTrimmed(raw.result) || "filled";
  const note = asTrimmed(raw.note) || undefined;
  return {
    kind: "transfer",
    venue: venueRaw,
    orderId: orderId || tradeKey,
    tradeId: tradeId || undefined,
    ticker: symbol,
    qty,
    fromSleeve,
    toSleeve,
    filledAt,
    result,
    note,
    idempotencyKey,
  };
}

export function eventToFill(event: NormalizedRewardEvent): RewardFill;
export function eventToFill(event: NormalizedTransferEvent): TransferFill;
export function eventToFill(event: NormalizedTradeEvent): TradeFill;
export function eventToFill(event: NormalizedFillEvent): Fill;
export function eventToFill(event: NormalizedFillEvent): Fill {
  if (event.kind === "reward") {
    return {
      kind: "reward",
      time: event.filledAt,
      symbol: event.ticker,
      quantity: event.qty,
      orderId: event.orderId,
      result: event.result,
      venue: "manual",
      sleeve: "flare-vault",
      idempotencyKey: event.idempotencyKey,
      ...(event.note ? { note: event.note } : {}),
    };
  }
  if (event.kind === "transfer") {
    return {
      kind: "transfer",
      time: event.filledAt,
      symbol: event.ticker,
      quantity: event.qty,
      orderId: event.orderId,
      result: event.result,
      venue: event.venue,
      fromSleeve: event.fromSleeve,
      toSleeve: event.toSleeve,
      idempotencyKey: event.idempotencyKey,
      ...(event.tradeId ? { tradeId: event.tradeId } : {}),
      ...(event.note ? { note: event.note } : {}),
    };
  }
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
    ...(event.feeUsd ? { feeUsd: event.feeUsd } : {}),
    ...(event.backfill ? { backfill: true as const } : {}),
  };
}

export function fillMatchesEvent(fill: Fill, event: NormalizedFillEvent): boolean {
  if (fill.idempotencyKey && fill.idempotencyKey === event.idempotencyKey) {
    return true;
  }
  if (fill.orderId && tradeKeysMatch(fill.orderId, event.orderId)) {
    return true;
  }
  const tradeId = "tradeId" in event ? event.tradeId : undefined;
  if (tradeId && fill.tradeId && tradeKeysMatch(fill.tradeId, tradeId)) {
    return true;
  }
  if (tradeId && fill.orderId && tradeKeysMatch(fill.orderId, tradeId)) {
    return true;
  }
  return false;
}
