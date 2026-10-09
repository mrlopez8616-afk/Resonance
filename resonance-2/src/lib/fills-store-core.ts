import { fills as seedFills, type Fill, type FillSleeveId, type RewardFill, type TransferFill } from "@/data/fills";
import {
  isPositionLogOrder,
  POSITION_LOG_FILLS,
} from "@/data/position-log-fills";
import {
  eventToFill,
  fillMatchesEvent,
  parseFillEvent,
  type NormalizedFillEvent,
} from "@/lib/fill-event";
import {
  applyFillToSleevePrints,
  applyTransferToSleevePrints,
  sanitizeSleevePrints,
  type SleevePrints,
} from "@/lib/sleeve-apply";
import { detectStoreBackend, type EnvLike, type StoreBackendName } from "@/lib/store-backend";

export const FILLS_STORE_VERSION = 1;
export const FILLS_BLOB_PATH = "resonance-2/fills.json";
export const DEFAULT_FILLS_FILE = ".data/fills.json";

export type FillsStoreBackend = StoreBackendName;
export type { EnvLike };

export interface FillsStoreEnvelope {
  version: typeof FILLS_STORE_VERSION;
  updatedAt: string;
  seededAt: string | null;
  fills: Fill[];
  sleevePrints: SleevePrints;
}

export function detectFillsBackend(env: EnvLike = process.env): FillsStoreBackend {
  return detectStoreBackend(env, "RESONANCE_FILLS_FILE");
}

export function isFillsStoreConfigured(
  env: EnvLike = process.env,
): boolean {
  return detectFillsBackend(env) !== "none";
}

export function createEmptyFillsEnvelope(
  now = new Date().toISOString(),
): FillsStoreEnvelope {
  return {
    version: FILLS_STORE_VERSION,
    updatedAt: now,
    seededAt: null,
    fills: [],
    sleevePrints: {},
  };
}

export function createSeededFillsEnvelope(
  now = new Date().toISOString(),
): FillsStoreEnvelope {
  return {
    version: FILLS_STORE_VERSION,
    updatedAt: now,
    seededAt: now,
    fills: seedFills.map((row) => ({ ...row })),
    sleevePrints: {},
  };
}

export function ensureSeededFillsEnvelope(
  current: FillsStoreEnvelope | null,
  now = new Date().toISOString(),
): { envelope: FillsStoreEnvelope; seeded: boolean } {
  let envelope: FillsStoreEnvelope;
  let seeded: boolean;
  if (!current || current.fills.length === 0) {
    envelope = createSeededFillsEnvelope(now);
    seeded = true;
  } else {
    envelope = {
      ...current,
      sleevePrints: sanitizeSleevePrints(current.sleevePrints),
    };
    seeded = false;
  }
  const logged = mergePositionLogFills(envelope, now);
  if (logged.inserted) seeded = true;
  return { envelope: logged.envelope, seeded };
}

/**
 * Append the confirmed HBAR position fills and the retained XLM log rows
 * when their order ids are missing. Sleeve prints stay as they are.
 * A second pass is a no-op.
 */
export function mergePositionLogFills(
  envelope: FillsStoreEnvelope,
  now = new Date().toISOString(),
): { envelope: FillsStoreEnvelope; inserted: boolean } {
  let next = envelope;
  let inserted = false;
  for (const body of POSITION_LOG_FILLS) {
    const written = ingestFillIntoEnvelope(next, parseFillEvent(body), now);
    if (written.applied) {
      throw new Error(
        `position log fill ${body.orderId} must not move a sleeve.`,
      );
    }
    if (!written.deduped) {
      next = written.envelope;
      inserted = true;
    }
  }
  return { envelope: next, inserted };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSleeveId(value: unknown): FillSleeveId | null {
  if (
    value === "rh-main" ||
    value === "rh-agentic" ||
    value === "coinbase" ||
    value === "cb-agentic"
  ) {
    return value;
  }
  return null;
}

function coerceTransferFill(raw: Record<string, unknown>): TransferFill | null {
  if (typeof raw.time !== "string" || !raw.time.trim()) return null;
  if (typeof raw.symbol !== "string" || !raw.symbol.trim()) return null;
  if (typeof raw.quantity !== "string" || !raw.quantity.trim()) return null;
  if (typeof raw.orderId !== "string" || !raw.orderId.trim()) return null;
  if (typeof raw.idempotencyKey !== "string" || !raw.idempotencyKey.trim()) return null;
  const fromSleeve = readSleeveId(raw.fromSleeve);
  const toSleeve = readSleeveId(raw.toSleeve);
  if (!fromSleeve || !toSleeve || fromSleeve === toSleeve) return null;
  if (raw.venue !== "robinhood" && raw.venue !== "coinbase") return null;
  const fill: TransferFill = {
    kind: "transfer",
    time: raw.time,
    symbol: raw.symbol,
    quantity: raw.quantity,
    orderId: raw.orderId,
    result: typeof raw.result === "string" && raw.result ? raw.result : "filled",
    venue: raw.venue,
    fromSleeve,
    toSleeve,
    idempotencyKey: raw.idempotencyKey.trim(),
  };
  if (typeof raw.tradeId === "string" && raw.tradeId.trim()) fill.tradeId = raw.tradeId.trim();
  if (typeof raw.note === "string" && raw.note.trim()) fill.note = raw.note.trim();
  return fill;
}

function coerceRewardFill(raw: Record<string, unknown>): RewardFill | null {
  if (typeof raw.time !== "string" || !raw.time.trim()) return null;
  if (raw.symbol !== "XRP") return null;
  if (typeof raw.quantity !== "string" || !raw.quantity.trim()) return null;
  if (typeof raw.orderId !== "string" || !raw.orderId.trim()) return null;
  if (typeof raw.idempotencyKey !== "string" || !raw.idempotencyKey.trim()) return null;
  if (raw.sleeve !== "flare-vault") return null;
  if (raw.venue !== "manual") return null;
  const fill: RewardFill = {
    kind: "reward",
    time: raw.time,
    symbol: "XRP",
    quantity: raw.quantity,
    orderId: raw.orderId,
    result: typeof raw.result === "string" && raw.result ? raw.result : "filled",
    venue: "manual",
    sleeve: "flare-vault",
    idempotencyKey: raw.idempotencyKey.trim(),
  };
  if (typeof raw.note === "string" && raw.note.trim()) fill.note = raw.note.trim();
  return fill;
}

function coerceStoredFill(raw: unknown): Fill | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "reward" || raw.side === "reward") return coerceRewardFill(raw);
  if (raw.kind === "transfer" || raw.side === "transfer") return coerceTransferFill(raw);
  if (typeof raw.time !== "string" || !raw.time.trim()) return null;
  if (typeof raw.symbol !== "string" || !raw.symbol.trim()) return null;
  if (raw.side !== "buy" && raw.side !== "sell") return null;
  if (typeof raw.quantity !== "string") return null;
  if (typeof raw.price !== "string") return null;
  if (typeof raw.orderId !== "string" || !raw.orderId.trim()) return null;
  const fill: Fill = {
    time: raw.time,
    symbol: raw.symbol,
    side: raw.side,
    quantity: raw.quantity,
    price: raw.price,
    orderId: raw.orderId,
    result: typeof raw.result === "string" && raw.result ? raw.result : "filled",
  };
  if (raw.venue === "robinhood" || raw.venue === "coinbase") {
    fill.venue = raw.venue;
  }
  if (typeof raw.tradeId === "string" && raw.tradeId.trim()) {
    fill.tradeId = raw.tradeId.trim();
  }
  if (
    raw.sleeve === "rh-main" ||
    raw.sleeve === "rh-agentic" ||
    raw.sleeve === "coinbase" ||
    raw.sleeve === "cb-agentic"
  ) {
    fill.sleeve = raw.sleeve;
  }
  if (typeof raw.idempotencyKey === "string" && raw.idempotencyKey.trim()) {
    fill.idempotencyKey = raw.idempotencyKey.trim();
  }
  if (typeof raw.note === "string" && raw.note.trim()) {
    fill.note = raw.note.trim();
  }
  if (typeof raw.feeUsd === "string" && raw.feeUsd.trim()) {
    fill.feeUsd = raw.feeUsd.trim();
  }
  if (raw.logOnly === true) fill.logOnly = true;
  if (raw.backfill === true) fill.backfill = true;
  return fill;
}

function coerceSleevePrints(raw: unknown): SleevePrints {
  if (!isRecord(raw)) return {};
  const prints: SleevePrints = {};
  for (const [ticker, rows] of Object.entries(raw)) {
    if (!isRecord(rows)) continue;
    const next: Record<string, string> = {};
    for (const [id, quantity] of Object.entries(rows)) {
      if (typeof quantity === "string" && quantity.trim()) {
        next[id] = quantity.trim();
      }
    }
    if (Object.keys(next).length > 0) prints[ticker] = next;
  }
  return sanitizeSleevePrints(prints);
}

export function parseFillsEnvelope(raw: unknown): FillsStoreEnvelope | null {
  if (!isRecord(raw) || !Array.isArray(raw.fills)) return null;
  const parsed = raw.fills
    .map((item) => coerceStoredFill(item))
    .filter((item): item is Fill => item !== null);
  return {
    version: FILLS_STORE_VERSION,
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt
        ? raw.updatedAt
        : new Date().toISOString(),
    seededAt: typeof raw.seededAt === "string" ? raw.seededAt : null,
    fills: parsed,
    sleevePrints: coerceSleevePrints(raw.sleevePrints),
  };
}

export function findFillInEnvelope(
  envelope: FillsStoreEnvelope,
  event: NormalizedFillEvent,
): Fill | undefined {
  return envelope.fills.find((row) => fillMatchesEvent(row, event));
}

function fillIsBackfill(fill: Fill): boolean {
  return fill.kind !== "bet" && fill.kind !== "transfer" && fill.kind !== "reward" && fill.backfill === true;
}

export function ingestFillIntoEnvelope(
  envelope: FillsStoreEnvelope,
  event: NormalizedFillEvent,
  now = new Date().toISOString(),
): {
  envelope: FillsStoreEnvelope;
  fill: Fill;
  deduped: boolean;
  applied: boolean;
  /** Present when the stored row is a historical replay. */
  backfill?: true;
} {
  const existing = findFillInEnvelope(envelope, event);
  if (existing) {
    return {
      envelope,
      fill: existing,
      deduped: true,
      applied: false,
      ...(fillIsBackfill(existing) ? { backfill: true as const } : {}),
    };
  }

  if (event.kind === "reward") {
    const fill = eventToFill(event);
    return {
      envelope: {
        ...envelope,
        updatedAt: now,
        fills: [...envelope.fills, fill],
        sleevePrints: envelope.sleevePrints,
      },
      fill,
      deduped: false,
      applied: false,
    };
  }

  if (event.kind === "transfer") {
    const moved = applyTransferToSleevePrints(envelope.sleevePrints, event);
    const fill = eventToFill(event);
    return {
      envelope: {
        ...envelope,
        updatedAt: now,
        fills: [...envelope.fills, fill],
        sleevePrints: moved.prints,
      },
      fill,
      deduped: false,
      applied: moved.applied,
    };
  }

  // These order ids are already accounted for: HBAR inside its sleeve seed,
  // XLM only on the operator log. Logging them must not move a sleeve.
  if (isPositionLogOrder(event.orderId)) {
    const logged = eventToFill(event);
    delete logged.backfill;
    const fill: Fill = { ...logged, logOnly: true };
    return {
      envelope: {
        ...envelope,
        updatedAt: now,
        fills: [...envelope.fills, fill],
        sleevePrints: envelope.sleevePrints,
      },
      fill,
      deduped: false,
      applied: false,
    };
  }

  // General form of the position-log exception. `backfill: true` (alias
  // `historical: true`) logs a new order without moving a sleeve. The
  // order-id dedupe above still covers a second POST. Face checks stay
  // the same as a live fill; the computed prints are discarded.
  if (event.backfill) {
    applyFillToSleevePrints(envelope.sleevePrints, event);
    const fill = eventToFill(event);
    return {
      envelope: {
        ...envelope,
        updatedAt: now,
        fills: [...envelope.fills, fill],
        sleevePrints: envelope.sleevePrints,
      },
      fill,
      deduped: false,
      applied: false,
      backfill: true,
    };
  }

  const applied = applyFillToSleevePrints(envelope.sleevePrints, event);
  const fill = eventToFill(event);
  return {
    envelope: {
      ...envelope,
      updatedAt: now,
      fills: [...envelope.fills, fill],
      sleevePrints: applied.prints,
    },
    fill,
    deduped: false,
    applied: applied.applied,
  };
}
