import {
  fightResultSeed,
  mergeFightResult,
  sameFightResult,
  type FightResult,
} from "@/lib/fight-results";
import { detectStoreBackend, type EnvLike, type StoreBackendName } from "@/lib/store-backend";

export const FIGHT_RESULTS_STORE_VERSION = 1;
export const FIGHT_RESULTS_BLOB_PATH = "resonance-2/fight-results.json";
export const DEFAULT_FIGHT_RESULTS_FILE = ".data/fight-results.json";

export type FightResultsBackend = StoreBackendName;
export type { EnvLike };

export interface FightResultsEnvelope {
  version: typeof FIGHT_RESULTS_STORE_VERSION;
  updatedAt: string;
  seededAt: string | null;
  results: FightResult[];
}

export function detectFightResultsBackend(env: EnvLike = process.env): FightResultsBackend {
  return detectStoreBackend(env, "RESONANCE_FIGHT_RESULTS_FILE");
}

export function isFightResultsStoreConfigured(env: EnvLike = process.env): boolean {
  return detectFightResultsBackend(env) !== "none";
}

export function createEmptyFightResultsEnvelope(now = new Date().toISOString()): FightResultsEnvelope {
  return {
    version: FIGHT_RESULTS_STORE_VERSION,
    updatedAt: now,
    seededAt: null,
    results: [],
  };
}

function hubConfirmed(result: FightResult): boolean {
  return (result.source ?? "").startsWith("Hub confirmed");
}

function sameCardResult(current: FightResult, seed: FightResult): boolean {
  return (
    current.winner === seed.winner &&
    current.method === seed.method &&
    current.round === seed.round &&
    current.time === seed.time &&
    current.status === seed.status
  );
}

/**
 * Insert seed slugs that are missing.
 * A stored row with another source is left alone, even when the seed differs.
 * A Hub confirmed row is replaced when its winner, method, round, or time disagrees with the seed.
 */
export function ensureSeededFightResults(
  current: FightResultsEnvelope | null,
  now = new Date().toISOString(),
): { envelope: FightResultsEnvelope; seeded: boolean } {
  const envelope = current ?? createEmptyFightResultsEnvelope(now);
  const bySlug = new Map(envelope.results.map((row) => [row.fightSlug, row]));
  const results = envelope.results.slice();
  let changed = false;

  for (const seed of fightResultSeed()) {
    const existing = bySlug.get(seed.fightSlug);
    if (!existing) {
      results.push(seed);
      bySlug.set(seed.fightSlug, seed);
      changed = true;
      continue;
    }
    if (hubConfirmed(existing) && !sameCardResult(existing, seed)) {
      const index = results.findIndex((row) => row.fightSlug === seed.fightSlug);
      if (index !== -1) {
        results[index] = seed;
        changed = true;
      }
    }
  }

  if (!changed) return { envelope, seeded: false };
  return {
    envelope: {
      ...envelope,
      updatedAt: now,
      seededAt: envelope.seededAt ?? now,
      results,
    },
    seeded: true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceResult(raw: unknown): FightResult | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.event !== "string" || !raw.event.trim()) return null;
  if (typeof raw.fightSlug !== "string" || !raw.fightSlug.trim()) return null;
  if (typeof raw.winner !== "string" || !raw.winner.trim()) return null;
  if (typeof raw.method !== "string" || !raw.method.trim()) return null;
  if (typeof raw.round !== "number" || !Number.isInteger(raw.round)) return null;
  if (typeof raw.time !== "string" || !raw.time.trim()) return null;
  if (raw.status !== "final" && raw.status !== "pending") return null;
  const result: FightResult = {
    event: raw.event.trim(),
    fightSlug: raw.fightSlug.trim(),
    winner: raw.winner.trim(),
    method: raw.method.trim(),
    round: raw.round,
    time: raw.time.trim(),
    status: raw.status,
  };
  if (typeof raw.opponent === "string" && raw.opponent.trim()) result.opponent = raw.opponent.trim();
  if (typeof raw.source === "string" && raw.source.trim()) result.source = raw.source.trim();
  return result;
}

export function parseFightResultsEnvelope(raw: unknown): FightResultsEnvelope | null {
  if (!isRecord(raw) || !Array.isArray(raw.results)) return null;
  const results = raw.results
    .map((item) => coerceResult(item))
    .filter((item): item is FightResult => item !== null);
  return {
    version: FIGHT_RESULTS_STORE_VERSION,
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt
        ? raw.updatedAt
        : new Date().toISOString(),
    seededAt: typeof raw.seededAt === "string" ? raw.seededAt : null,
    results,
  };
}

/**
 * Same payload is a no-op. A corrected winner, method, round, or time replaces the row.
 * Omitted source and opponent keep the stored values. This does not touch bets.
 */
export function upsertFightResult(
  envelope: FightResultsEnvelope,
  incoming: FightResult,
  now: string,
): { envelope: FightResultsEnvelope; deduped: boolean; result: FightResult } {
  const index = envelope.results.findIndex((row) => row.fightSlug === incoming.fightSlug);
  if (index === -1) {
    return {
      envelope: { ...envelope, updatedAt: now, results: [...envelope.results, incoming] },
      deduped: false,
      result: incoming,
    };
  }
  const merged = mergeFightResult(envelope.results[index], incoming);
  if (sameFightResult(envelope.results[index], merged)) {
    return { envelope, deduped: true, result: envelope.results[index] };
  }
  const results = envelope.results.slice();
  results[index] = merged;
  return {
    envelope: { ...envelope, updatedAt: now, results },
    deduped: false,
    result: merged,
  };
}
