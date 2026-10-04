import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { FightResultWriteError, type FightResult } from "@/lib/fight-results";
import {
  createEmptyFightResultsEnvelope,
  DEFAULT_FIGHT_RESULTS_FILE,
  detectFightResultsBackend,
  ensureSeededFightResults,
  FIGHT_RESULTS_BLOB_PATH,
  isFightResultsStoreConfigured,
  parseFightResultsEnvelope,
  upsertFightResult,
  type FightResultsBackend,
  type FightResultsEnvelope,
} from "@/lib/fight-results-store-core";

export {
  detectFightResultsBackend,
  isFightResultsStoreConfigured,
  type FightResultsBackend,
  type FightResultsEnvelope,
};

export class FightResultsStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FightResultsStoreError";
  }
}

function filePath(env: Record<string, string | undefined> = process.env): string {
  const configured = env.RESONANCE_FIGHT_RESULTS_FILE?.trim();
  return path.resolve(configured || DEFAULT_FIGHT_RESULTS_FILE);
}

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const response = new Response(stream);
  return response.text();
}

async function readBlobEnvelope(): Promise<FightResultsEnvelope | null> {
  const { get } = await import("@vercel/blob");
  const result = await get(FIGHT_RESULTS_BLOB_PATH, {
    access: "private",
    useCache: false,
  });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await streamToString(result.stream);
  if (!text.trim()) return null;
  try {
    return parseFightResultsEnvelope(JSON.parse(text));
  } catch {
    return null;
  }
}

async function writeBlobEnvelope(envelope: FightResultsEnvelope): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(FIGHT_RESULTS_BLOB_PATH, JSON.stringify(envelope, null, 2), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

async function readFileEnvelope(): Promise<FightResultsEnvelope | null> {
  try {
    const text = await readFile(filePath(), "utf8");
    if (!text.trim()) return null;
    return parseFightResultsEnvelope(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeFileEnvelope(envelope: FightResultsEnvelope): Promise<void> {
  const target = filePath();
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
}

async function readRawEnvelope(): Promise<FightResultsEnvelope | null> {
  const backend = detectFightResultsBackend();
  if (backend === "blob") return readBlobEnvelope();
  if (backend === "file") return readFileEnvelope();
  return null;
}

async function persistEnvelope(envelope: FightResultsEnvelope): Promise<void> {
  const backend = detectFightResultsBackend();
  if (backend === "blob") {
    await writeBlobEnvelope(envelope);
    return;
  }
  if (backend === "file") {
    await writeFileEnvelope(envelope);
    return;
  }
  throw new FightResultsStoreError(
    "Fight result store is not configured. Create a Vercel Blob store and redeploy.",
  );
}

export async function loadFightResultsStore(): Promise<{
  configured: boolean;
  backend: FightResultsBackend;
  envelope: FightResultsEnvelope;
  seeded: boolean;
}> {
  const backend = detectFightResultsBackend();
  if (backend === "none") {
    const seeded = ensureSeededFightResults(null);
    return { configured: false, backend, envelope: seeded.envelope, seeded: true };
  }
  const raw = await readRawEnvelope();
  const seeded = ensureSeededFightResults(raw);
  if (seeded.seeded) await persistEnvelope(seeded.envelope);
  return { configured: true, backend, envelope: seeded.envelope, seeded: seeded.seeded };
}

/** Writes fight results only. The hub settles bets on its own endpoint. */
export async function recordFightResults(incoming: readonly FightResult[]): Promise<{
  envelope: FightResultsEnvelope;
  backend: FightResultsBackend;
  results: { fightSlug: string; deduped: boolean; result: FightResult }[];
}> {
  if (!isFightResultsStoreConfigured()) {
    throw new FightResultsStoreError(
      "Fight result store is not configured. Create a Vercel Blob store and redeploy.",
    );
  }
  const loaded = await loadFightResultsStore();
  const now = new Date().toISOString();
  let envelope = loaded.envelope;
  const results: { fightSlug: string; deduped: boolean; result: FightResult }[] = [];
  let changed = false;
  for (const result of incoming) {
    const written = upsertFightResult(envelope, result, now);
    results.push({ fightSlug: result.fightSlug, deduped: written.deduped, result: written.result });
    if (!written.deduped) {
      envelope = written.envelope;
      changed = true;
    }
  }
  if (changed) await persistEnvelope(envelope);
  return { envelope, backend: loaded.backend, results };
}

export function asFightResultWriteError(error: unknown): { status: number; message: string } {
  if (error instanceof FightResultWriteError) {
    return { status: error.status, message: error.message };
  }
  if (error instanceof FightResultsStoreError) {
    return { status: 503, message: error.message };
  }
  return {
    status: 500,
    message: error instanceof Error ? error.message : "Fight result store failed.",
  };
}

export function emptyFightResultsEnvelope(): FightResultsEnvelope {
  return createEmptyFightResultsEnvelope();
}
