import "server-only";

import { cache } from "react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BetWriteError,
  placeBet,
  settleBet,
  type Bet,
  type BetPost,
  type SettleRequest,
} from "@/lib/bets";
import {
  BLOB_TAGS,
  cachedBlobRead,
  putPrivateBlob,
  readPrivateBlob,
  revalidateBlobTag,
} from "@/lib/blob-read";
import {
  StorageUnavailableError,
  isStorageUnavailable,
  throwIfStorageForced,
} from "@/lib/storage-unavailable";
import {
  BETS_BLOB_PATH,
  createEmptyBetsEnvelope,
  DEFAULT_BETS_FILE,
  applyBetCorrections,
  backfillBetLeans,
  detectBetsBackend,
  ensureSeededBetsEnvelope,
  isBetsStoreConfigured,
  parseBetsEnvelope,
  replaceBet,
  type BetsStoreBackend,
  type BetsStoreEnvelope,
} from "@/lib/bets-store-core";

export {
  detectBetsBackend,
  isBetsStoreConfigured,
  type BetsStoreBackend,
  type BetsStoreEnvelope,
};

export class BetsStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BetsStoreError";
  }
}

function filePath(env: Record<string, string | undefined> = process.env): string {
  const configured = env.RESONANCE_BETS_FILE?.trim();
  return path.resolve(configured || DEFAULT_BETS_FILE);
}

/**
 * Seed missing ids, backfill leans, then apply versioned corrections.
 * Corrections run before the dirty flag so a one-shot patch is persisted once.
 * Rows that are not in the seed or the correction list are left as stored.
 */
function finalizeBets(raw: BetsStoreEnvelope | null): {
  envelope: BetsStoreEnvelope;
  seeded: boolean;
  dirty: boolean;
} {
  const seeded = ensureSeededBetsEnvelope(raw);
  const leaned = backfillBetLeans(seeded.envelope);
  const corrected = applyBetCorrections(leaned.envelope);
  return {
    envelope: corrected.envelope,
    seeded: seeded.seeded,
    dirty: seeded.seeded || leaned.changed || corrected.changed,
  };
}

function parseBlobText(text: string): BetsStoreEnvelope | null {
  try {
    return parseBetsEnvelope(JSON.parse(text));
  } catch {
    return null;
  }
}

async function persistEnvelope(envelope: BetsStoreEnvelope, revalidate: boolean): Promise<void> {
  const backend = detectBetsBackend();
  if (backend === "blob") {
    await putPrivateBlob(BETS_BLOB_PATH, JSON.stringify(envelope, null, 2));
    if (revalidate) revalidateBlobTag(BLOB_TAGS.bets);
    return;
  }
  if (backend === "file") {
    const target = filePath();
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
    return;
  }
  throw new BetsStoreError(
    "Bet store is not configured. Create a Vercel Blob store and redeploy.",
  );
}

async function readFileEnvelope(): Promise<BetsStoreEnvelope | null> {
  try {
    const text = await readFile(filePath(), "utf8");
    if (!text.trim()) return null;
    return parseBetsEnvelope(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new StorageUnavailableError(
      "bets",
      error instanceof Error ? error.message : "Bet file could not be read.",
    );
  }
}

async function materializeBlobText(text: string | null, revalidate: boolean): Promise<{
  envelope: BetsStoreEnvelope;
  seeded: boolean;
}> {
  const finalized = finalizeBets(text === null ? null : parseBlobText(text));
  if (finalized.dirty) await persistEnvelope(finalized.envelope, revalidate);
  return { envelope: finalized.envelope, seeded: finalized.seeded };
}

type CachedBets =
  | { status: "ok"; envelope: BetsStoreEnvelope; seeded: boolean }
  | { status: "unavailable"; reason: string };

async function readBetsBlob(revalidateWrites: boolean): Promise<CachedBets> {
  const body = await readPrivateBlob(BETS_BLOB_PATH);
  if (body.status === "unavailable") return body;
  try {
    const made = await materializeBlobText(
      body.status === "missing" ? null : body.text,
      revalidateWrites,
    );
    return { status: "ok", ...made };
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      return { status: "unavailable", reason: error.reason };
    }
    throw error;
  }
}

function unwrapBets(result: CachedBets): { envelope: BetsStoreEnvelope; seeded: boolean } {
  if (result.status === "unavailable") {
    throw new StorageUnavailableError("bets", result.reason);
  }
  return result;
}

async function loadBetsFromFile(): Promise<{
  envelope: BetsStoreEnvelope;
  seeded: boolean;
}> {
  const finalized = finalizeBets(await readFileEnvelope());
  if (finalized.dirty) await persistEnvelope(finalized.envelope, false);
  return { envelope: finalized.envelope, seeded: finalized.seeded };
}

async function loadBetsStoreInner(fresh: boolean): Promise<{
  configured: boolean;
  backend: BetsStoreBackend;
  envelope: BetsStoreEnvelope;
  seeded: boolean;
}> {
  throwIfStorageForced("bets");
  const backend = detectBetsBackend();
  if (backend === "none") {
    const finalized = finalizeBets(null);
    return {
      configured: false,
      backend,
      envelope: finalized.envelope,
      seeded: true,
    };
  }
  if (backend === "file") {
    const loaded = await loadBetsFromFile();
    return { configured: true, backend, ...loaded };
  }
  const loaded = fresh
    ? unwrapBets(await readBetsBlob(true))
    : unwrapBets(await cachedBlobRead(BLOB_TAGS.bets, () => readBetsBlob(false)));
  return { configured: true, backend, ...loaded };
}

/** Display read. Deduped within a request and cached for 45s across requests. */
export const loadBetsStore = cache(() => loadBetsStoreInner(false));

/**
 * Read-modify-write. Bypasses the 45s cache so a settle cannot apply onto a
 * stale book. The tag is dropped only after a successful blob put.
 */
export function loadBetsStoreFresh(): Promise<{
  configured: boolean;
  backend: BetsStoreBackend;
  envelope: BetsStoreEnvelope;
  seeded: boolean;
}> {
  return loadBetsStoreInner(true);
}

export async function settleStoredBets(requests: readonly SettleRequest[]): Promise<{
  envelope: BetsStoreEnvelope;
  backend: BetsStoreBackend;
  results: { id: string; deduped: boolean; bet: Bet }[];
}> {
  if (!isBetsStoreConfigured()) {
    throw new BetsStoreError(
      "Bet store is not configured. Create a Vercel Blob store and redeploy.",
    );
  }
  const loaded = await loadBetsStoreFresh();
  const now = new Date().toISOString();
  let envelope = loaded.envelope;
  const results: { id: string; deduped: boolean; bet: Bet }[] = [];
  let changed = false;
  for (const request of requests) {
    const current = envelope.bets.find((bet) => bet.id === request.id);
    if (!current) {
      throw new BetWriteError(`Unknown bet id ${request.id}.`, 404);
    }
    const written = settleBet(current, request, now);
    results.push({ id: request.id, deduped: written.deduped, bet: written.bet });
    if (!written.deduped) {
      envelope = replaceBet(envelope, written.bet, now);
      changed = true;
    }
  }
  if (changed) await persistEnvelope(envelope, true);
  return { envelope, backend: loaded.backend, results };
}

export async function postStoredBets(requests: readonly BetPost[]): Promise<{
  envelope: BetsStoreEnvelope;
  backend: BetsStoreBackend;
  results: { orderId: string; id: string; deduped: boolean; bet: Bet }[];
}> {
  if (!isBetsStoreConfigured()) {
    throw new BetsStoreError(
      "Bet store is not configured. Create a Vercel Blob store and redeploy.",
    );
  }
  const loaded = await loadBetsStoreFresh();
  const now = new Date().toISOString();
  let envelope = loaded.envelope;
  const results: { orderId: string; id: string; deduped: boolean; bet: Bet }[] = [];
  let changed = false;
  for (const request of requests) {
    const written = placeBet(envelope.bets, request, now);
    results.push({
      orderId: request.orderId,
      id: written.bet.id,
      deduped: written.deduped,
      bet: written.bet,
    });
    if (!written.deduped) {
      envelope = { ...envelope, updatedAt: now, bets: written.bets };
      changed = true;
    }
  }
  if (changed) await persistEnvelope(envelope, true);
  return { envelope, backend: loaded.backend, results };
}

export function asBetWriteError(error: unknown): {
  status: number;
  message: string;
  reason?: string;
} {
  if (isStorageUnavailable(error)) {
    return { status: 503, message: error.message, reason: error.reason };
  }
  if (error instanceof BetWriteError) {
    return { status: error.status, message: error.message };
  }
  if (error instanceof BetsStoreError) {
    return { status: 503, message: error.message };
  }
  return {
    status: 500,
    message: error instanceof Error ? error.message : "Bet store failed.",
  };
}

export function emptyBetsEnvelope(): BetsStoreEnvelope {
  return createEmptyBetsEnvelope();
}
