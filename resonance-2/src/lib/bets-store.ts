import "server-only";

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
  BETS_BLOB_PATH,
  createEmptyBetsEnvelope,
  DEFAULT_BETS_FILE,
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

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const response = new Response(stream);
  return response.text();
}

async function readBlobEnvelope(): Promise<BetsStoreEnvelope | null> {
  const { get } = await import("@vercel/blob");
  const result = await get(BETS_BLOB_PATH, {
    access: "private",
    useCache: false,
  });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await streamToString(result.stream);
  if (!text.trim()) return null;
  try {
    return parseBetsEnvelope(JSON.parse(text));
  } catch {
    return null;
  }
}

async function writeBlobEnvelope(envelope: BetsStoreEnvelope): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(BETS_BLOB_PATH, JSON.stringify(envelope, null, 2), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

async function readFileEnvelope(): Promise<BetsStoreEnvelope | null> {
  try {
    const text = await readFile(filePath(), "utf8");
    if (!text.trim()) return null;
    return parseBetsEnvelope(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeFileEnvelope(envelope: BetsStoreEnvelope): Promise<void> {
  const target = filePath();
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
}

async function readRawEnvelope(): Promise<BetsStoreEnvelope | null> {
  const backend = detectBetsBackend();
  if (backend === "blob") return readBlobEnvelope();
  if (backend === "file") return readFileEnvelope();
  return null;
}

async function persistEnvelope(envelope: BetsStoreEnvelope): Promise<void> {
  const backend = detectBetsBackend();
  if (backend === "blob") {
    await writeBlobEnvelope(envelope);
    return;
  }
  if (backend === "file") {
    await writeFileEnvelope(envelope);
    return;
  }
  throw new BetsStoreError(
    "Bet store is not configured. Create a Vercel Blob store and redeploy.",
  );
}

export async function loadBetsStore(): Promise<{
  configured: boolean;
  backend: BetsStoreBackend;
  envelope: BetsStoreEnvelope;
  seeded: boolean;
}> {
  const backend = detectBetsBackend();
  if (backend === "none") {
    const seeded = ensureSeededBetsEnvelope(null);
    return {
      configured: false,
      backend,
      envelope: backfillBetLeans(seeded.envelope).envelope,
      seeded: true,
    };
  }
  const raw = await readRawEnvelope();
  const seeded = ensureSeededBetsEnvelope(raw);
  const leaned = backfillBetLeans(seeded.envelope);
  if (seeded.seeded || leaned.changed) await persistEnvelope(leaned.envelope);
  return { configured: true, backend, envelope: leaned.envelope, seeded: seeded.seeded };
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
  const loaded = await loadBetsStore();
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
  if (changed) await persistEnvelope(envelope);
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
  const loaded = await loadBetsStore();
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
  if (changed) await persistEnvelope(envelope);
  return { envelope, backend: loaded.backend, results };
}

export function asBetWriteError(error: unknown): { status: number; message: string } {
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
