import { detectStoreBackend, type EnvLike, type StoreBackendName } from "@/lib/store-backend";
import type { FightBreakdown } from "@/lib/fight-breakdowns";

export const BREAKDOWNS_STORE_VERSION = 1;
export const BREAKDOWNS_BLOB_PATH = "resonance-2/fight-breakdowns.json";
export const DEFAULT_BREAKDOWNS_FILE = ".data/fight-breakdowns.json";

export type FightBreakdownsBackend = StoreBackendName;
export type { EnvLike };

export interface FightBreakdownsEnvelope {
  version: typeof BREAKDOWNS_STORE_VERSION;
  updatedAt: string;
  breakdowns: FightBreakdown[];
}

export function detectFightBreakdownsBackend(env: EnvLike = process.env): FightBreakdownsBackend {
  return detectStoreBackend(env, "RESONANCE_FIGHT_BREAKDOWNS_FILE");
}

export function isFightBreakdownsStoreConfigured(env: EnvLike = process.env): boolean {
  return detectFightBreakdownsBackend(env) !== "none";
}

export function createEmptyBreakdownsEnvelope(now = new Date().toISOString()): FightBreakdownsEnvelope {
  return {
    version: BREAKDOWNS_STORE_VERSION,
    updatedAt: now,
    breakdowns: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBreakdown(value: unknown): value is FightBreakdown {
  if (!isRecord(value)) return false;
  return (
    typeof value.eventSlug === "string" &&
    typeof value.fightSlug === "string" &&
    Array.isArray(value.edges)
  );
}

/** Drop rows that are not breakdowns. A second read of the same file is stable. */
export function parseBreakdownsEnvelope(raw: unknown): FightBreakdownsEnvelope | null {
  if (!isRecord(raw) || !Array.isArray(raw.breakdowns)) return null;
  const breakdowns = raw.breakdowns.filter(isBreakdown);
  return {
    version: BREAKDOWNS_STORE_VERSION,
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt ? raw.updatedAt : new Date().toISOString(),
    breakdowns,
  };
}
