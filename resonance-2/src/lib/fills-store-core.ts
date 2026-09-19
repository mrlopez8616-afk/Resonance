import { fills as seedFills, type Fill } from "@/data/fills";
import { eventToFill, fillMatchesEvent, type NormalizedFillEvent } from "@/lib/fill-event";
import {
  applyFillToSleevePrints,
  sanitizeSleevePrints,
  type SleevePrints,
} from "@/lib/sleeve-apply";

export const FILLS_STORE_VERSION = 1;
export const FILLS_BLOB_PATH = "resonance-2/fills.json";
export const DEFAULT_FILLS_FILE = ".data/fills.json";

export type FillsStoreBackend = "blob" | "file" | "none";
export type EnvLike = Record<string, string | undefined>;

export interface FillsStoreEnvelope {
  version: typeof FILLS_STORE_VERSION;
  updatedAt: string;
  seededAt: string | null;
  fills: Fill[];
  sleevePrints: SleevePrints;
}

export function detectFillsBackend(
  env: EnvLike = process.env,
): FillsStoreBackend {
  if (env.BLOB_READ_WRITE_TOKEN?.trim()) return "blob";
  if (env.RESONANCE_FILLS_FILE?.trim()) return "file";
  if (env.VERCEL) return "none";
  return "file";
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
  if (!current || current.fills.length === 0) {
    return { envelope: createSeededFillsEnvelope(now), seeded: true };
  }
  return {
    envelope: {
      ...current,
      sleevePrints: sanitizeSleevePrints(current.sleevePrints),
    },
    seeded: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceStoredFill(raw: unknown): Fill | null {
  if (!isRecord(raw)) return null;
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
    raw.sleeve === "coinbase"
  ) {
    fill.sleeve = raw.sleeve;
  }
  if (typeof raw.idempotencyKey === "string" && raw.idempotencyKey.trim()) {
    fill.idempotencyKey = raw.idempotencyKey.trim();
  }
  if (typeof raw.note === "string" && raw.note.trim()) {
    fill.note = raw.note.trim();
  }
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

export function ingestFillIntoEnvelope(
  envelope: FillsStoreEnvelope,
  event: NormalizedFillEvent,
  now = new Date().toISOString(),
): {
  envelope: FillsStoreEnvelope;
  fill: Fill;
  deduped: boolean;
  applied: boolean;
} {
  const existing = findFillInEnvelope(envelope, event);
  if (existing) {
    return {
      envelope,
      fill: existing,
      deduped: true,
      applied: false,
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
