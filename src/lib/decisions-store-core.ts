import { coerceStoredDecision, LOCKED_DECISIONS_2026_09_11 } from "./decisions";
import {
  removeDecisionById,
  upsertDecisionsFromWrites,
  type DecisionWriteItem,
} from "./decision-write";
import type { Decision } from "./types";

export const DECISIONS_STORE_VERSION = 1;
export const DECISIONS_BLOB_PATH = "resonance/decisions.json";
export const DEFAULT_DECISIONS_FILE = ".data/decisions.json";

export type DecisionsStoreBackend = "blob" | "file" | "none";

export interface DecisionsStoreEnvelope {
  version: typeof DECISIONS_STORE_VERSION;
  updatedAt: string;
  seededAt: string | null;
  decisions: Decision[];
}

export function detectDecisionsBackend(env: NodeJS.ProcessEnv = process.env): DecisionsStoreBackend {
  if (env.BLOB_READ_WRITE_TOKEN?.trim()) return "blob";
  if (env.RESONANCE_DECISIONS_FILE?.trim()) return "file";
  if (env.VERCEL) return "none";
  return "file";
}

export function isDecisionsSyncConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return detectDecisionsBackend(env) !== "none";
}

export function createEmptyEnvelope(
  now = new Date().toISOString(),
): DecisionsStoreEnvelope {
  return {
    version: DECISIONS_STORE_VERSION,
    updatedAt: now,
    seededAt: null,
    decisions: [],
  };
}

export function createSeededEnvelope(
  now = new Date().toISOString(),
): DecisionsStoreEnvelope {
  return {
    version: DECISIONS_STORE_VERSION,
    updatedAt: now,
    seededAt: now,
    decisions: [...LOCKED_DECISIONS_2026_09_11],
  };
}

export function ensureSeededEnvelope(
  current: DecisionsStoreEnvelope | null,
  now = new Date().toISOString(),
): { envelope: DecisionsStoreEnvelope; seeded: boolean } {
  if (!current || current.decisions.length === 0) {
    return { envelope: createSeededEnvelope(now), seeded: true };
  }
  return { envelope: current, seeded: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseDecisionsEnvelope(
  raw: unknown,
): DecisionsStoreEnvelope | null {
  if (!isRecord(raw) || !Array.isArray(raw.decisions)) return null;
  const decisions = raw.decisions
    .map((item, index) => coerceStoredDecision(item, index))
    .filter((item): item is Decision => item !== null);
  return {
    version: DECISIONS_STORE_VERSION,
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt
        ? raw.updatedAt
        : new Date().toISOString(),
    seededAt: typeof raw.seededAt === "string" ? raw.seededAt : null,
    decisions,
  };
}

export function writeDecisionsIntoEnvelope(
  envelope: DecisionsStoreEnvelope,
  items: DecisionWriteItem[],
  now = new Date().toISOString(),
): DecisionsStoreEnvelope {
  const { decisions } = upsertDecisionsFromWrites(envelope.decisions, items, now);
  return {
    ...envelope,
    updatedAt: now,
    decisions,
  };
}

export function deleteDecisionFromEnvelope(
  envelope: DecisionsStoreEnvelope,
  id: string,
  now = new Date().toISOString(),
): DecisionsStoreEnvelope {
  return {
    ...envelope,
    updatedAt: now,
    decisions: removeDecisionById(envelope.decisions, id),
  };
}

export function decisionsStoreHealth(input: {
  configured: boolean;
  backend: DecisionsStoreBackend;
  writeProtection: "on" | "off";
  envelope: DecisionsStoreEnvelope | null;
}): {
  configured: boolean;
  backend: DecisionsStoreBackend;
  writeProtection: "on" | "off";
  recordCount: number;
  updatedAt: string | null;
  seeded: boolean;
} {
  return {
    configured: input.configured,
    backend: input.backend,
    writeProtection: input.writeProtection,
    recordCount: input.envelope?.decisions.length ?? 0,
    updatedAt: input.envelope?.updatedAt ?? null,
    seeded: Boolean(input.envelope?.seededAt),
  };
}
