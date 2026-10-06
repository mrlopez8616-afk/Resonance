import {
  BET_TICKER,
  BET_VENUE,
  betOrderKey,
  betSeed,
  money,
  readOptionalLean,
  realizedPnl,
  withStoredLean,
  type Bet,
  type BetStatus,
} from "@/lib/bets";
import { detectStoreBackend, type EnvLike, type StoreBackendName } from "@/lib/store-backend";

export const BETS_STORE_VERSION = 1;
export const BETS_BLOB_PATH = "resonance-2/bets.json";
export const DEFAULT_BETS_FILE = ".data/bets.json";

export type BetsStoreBackend = StoreBackendName;
export type { EnvLike };

export interface BetsStoreEnvelope {
  version: typeof BETS_STORE_VERSION;
  updatedAt: string;
  seededAt: string | null;
  bets: Bet[];
}

const BET_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const STATUSES = new Set<BetStatus>(["open", "won", "lost", "void", "sold"]);

/**
 * One-shot book fixes. Applied on read when the row's correctionVersion
 * is below this version. A later settle or override is not put back.
 * Ribovics is the only status rewrite. Coria and Wang Cong change stake only.
 * Other fee corrections stay pending. Settled rows outside this list stay stored.
 */
export type BetCorrection = {
  id: string;
  version: number;
  status?: BetStatus;
  payout?: string;
  stake?: string;
};

export const BET_CORRECTIONS: readonly BetCorrection[] = [
  { id: "ufc-332-ribovics", version: 1, status: "sold", payout: "13.64" },
  { id: "ufc-332-coria", version: 1, stake: "19.99" },
  { id: "ufc-332-wang-cong", version: 1, stake: "45.13" },
];

function applyBetCorrection(bet: Bet, correction: BetCorrection): Bet {
  const status = correction.status ?? bet.status;
  const stake = correction.stake ? money(correction.stake) : bet.stake;
  const next: Bet = { ...bet, status, stake, correctionVersion: correction.version };
  if (correction.payout) {
    const payout = money(correction.payout);
    if (status === "sold") {
      next.payout = payout;
      next.settledPayout = payout;
    } else if (status === "won") {
      next.settledPayout = payout;
    } else {
      next.payout = payout;
    }
  } else if (status === "won" && !next.settledPayout) {
    next.settledPayout = next.payout;
  }
  if (status === "open") {
    delete next.realizedPnl;
    delete next.settledPayout;
    delete next.settledAt;
  } else {
    next.realizedPnl = realizedPnl(stake, status, next.settledPayout ?? next.payout);
  }
  return next;
}

/** Seed plus lean backfill plus the versioned corrections. Used when the store read fails. */
export function fallbackBetBook(): Bet[] {
  const seeded = ensureSeededBetsEnvelope(null);
  const leaned = backfillBetLeans(seeded.envelope);
  return applyStoredBetCorrections(leaned.envelope).envelope.bets;
}

export function detectBetsBackend(env: EnvLike = process.env): BetsStoreBackend {
  return detectStoreBackend(env, "RESONANCE_BETS_FILE");
}

/**
 * Versioned bet corrections. Runs after the lean backfill and before the dirty flag.
 * A row already at that correctionVersion stays put. Other rows stay stored.
 */
export function applyStoredBetCorrections(
  envelope: BetsStoreEnvelope,
  now = new Date().toISOString(),
): { envelope: BetsStoreEnvelope; changed: boolean } {
  let changed = false;
  const bets = envelope.bets.map((bet) => {
    const correction = BET_CORRECTIONS.find((row) => row.id === bet.id);
    if (!correction) return bet;
    if ((bet.correctionVersion ?? 0) >= correction.version) return bet;
    changed = true;
    return applyBetCorrection(bet, correction);
  });
  if (!changed) return { envelope, changed: false };
  return { envelope: { ...envelope, updatedAt: now, bets }, changed: true };
}

export function isBetsStoreConfigured(env: EnvLike = process.env): boolean {
  return detectBetsBackend(env) !== "none";
}

export function createEmptyBetsEnvelope(now = new Date().toISOString()): BetsStoreEnvelope {
  return {
    version: BETS_STORE_VERSION,
    updatedAt: now,
    seededAt: null,
    bets: [],
  };
}

/**
 * Insert seed ids that are missing.
 * A row already stored under that id or orderId is left alone, including a settled row.
 * A second pass is a no-op.
 */
export function ensureSeededBetsEnvelope(
  current: BetsStoreEnvelope | null,
  now = new Date().toISOString(),
): { envelope: BetsStoreEnvelope; seeded: boolean } {
  const envelope = current ?? createEmptyBetsEnvelope(now);
  const presentIds = new Set(envelope.bets.map((bet) => bet.id));
  const presentOrders = new Set(envelope.bets.map((bet) => betOrderKey(bet)));
  const missing = betSeed().filter(
    (bet) => !presentIds.has(bet.id) && !presentOrders.has(betOrderKey(bet)),
  );
  if (missing.length === 0) {
    return { envelope, seeded: false };
  }
  return {
    envelope: {
      ...envelope,
      updatedAt: now,
      seededAt: envelope.seededAt ?? now,
      bets: [...envelope.bets, ...missing],
    },
    seeded: true,
  };
}

/**
 * Fill missing hubLean / agreesWithLean. Settled status and P&L stay put.
 * A second pass is a no-op. A stored lean is not replaced by the catalog.
 */
export function backfillBetLeans(
  envelope: BetsStoreEnvelope,
  now = new Date().toISOString(),
): { envelope: BetsStoreEnvelope; changed: boolean } {
  const bets = envelope.bets.map((bet) => withStoredLean(bet));
  const changed = bets.some((bet, index) => bet !== envelope.bets[index]);
  if (!changed) return { envelope, changed: false };
  return {
    envelope: { ...envelope, updatedAt: now, bets },
    changed: true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceBet(raw: unknown): Bet | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || !BET_ID.test(raw.id)) return null;
  if (typeof raw.event !== "string" || !raw.event.trim()) return null;
  if (typeof raw.fight !== "string" || !raw.fight.trim()) return null;
  if (typeof raw.fightSlug !== "string" || !raw.fightSlug.trim()) return null;
  if (typeof raw.pick !== "string" || !raw.pick.trim()) return null;
  if (typeof raw.stake !== "string" || !raw.stake.trim()) return null;
  if (typeof raw.payout !== "string" || !raw.payout.trim()) return null;
  if (typeof raw.oddsPct !== "number" || !Number.isFinite(raw.oddsPct)) return null;
  if (typeof raw.status !== "string" || !STATUSES.has(raw.status as BetStatus)) return null;
  if (raw.venue !== BET_VENUE || raw.ticker !== BET_TICKER) return null;
  if (typeof raw.time !== "string" || Number.isNaN(Date.parse(raw.time))) return null;
  const bet: Bet = {
    id: raw.id,
    event: raw.event.trim(),
    fight: raw.fight.trim(),
    fightSlug: raw.fightSlug.trim(),
    pick: raw.pick.trim(),
    stake: raw.stake.trim(),
    oddsPct: raw.oddsPct,
    payout: raw.payout.trim(),
    status: raw.status as BetStatus,
    venue: BET_VENUE,
    ticker: BET_TICKER,
    time: raw.time,
  };
  if (raw.estimated === true) bet.estimated = true;
  if (typeof raw.settledPayout === "string" && raw.settledPayout.trim()) {
    bet.settledPayout = raw.settledPayout.trim();
  }
  if (typeof raw.realizedPnl === "string" && raw.realizedPnl.trim()) {
    bet.realizedPnl = raw.realizedPnl.trim();
  }
  if (typeof raw.settledAt === "string" && raw.settledAt.trim()) {
    bet.settledAt = raw.settledAt.trim();
  }
  if (raw.orderId === null) bet.orderId = null;
  else if (typeof raw.orderId === "string") {
    const orderId = raw.orderId.trim().toLowerCase();
    if (BET_ID.test(orderId)) bet.orderId = orderId;
  }
  if (typeof raw.note === "string" && raw.note.trim()) {
    bet.note = raw.note.trim();
  }
  if (
    typeof raw.correctionVersion === "number" &&
    Number.isInteger(raw.correctionVersion) &&
    raw.correctionVersion >= 0
  ) {
    bet.correctionVersion = raw.correctionVersion;
  }
  const lean = readOptionalLean(raw);
  if (lean.hubLean) bet.hubLean = lean.hubLean;
  if (typeof lean.agreesWithLean === "boolean") bet.agreesWithLean = lean.agreesWithLean;
  return bet;
}

export function parseBetsEnvelope(raw: unknown): BetsStoreEnvelope | null {
  if (!isRecord(raw) || !Array.isArray(raw.bets)) return null;
  const bets = raw.bets.map((item) => coerceBet(item)).filter((item): item is Bet => item !== null);
  return {
    version: BETS_STORE_VERSION,
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt
        ? raw.updatedAt
        : new Date().toISOString(),
    seededAt: typeof raw.seededAt === "string" ? raw.seededAt : null,
    bets,
  };
}

export function replaceBet(
  envelope: BetsStoreEnvelope,
  bet: Bet,
  now: string,
): BetsStoreEnvelope {
  const index = envelope.bets.findIndex((row) => row.id === bet.id);
  if (index === -1) return envelope;
  const bets = envelope.bets.slice();
  bets[index] = bet;
  return { ...envelope, updatedAt: now, bets };
}
