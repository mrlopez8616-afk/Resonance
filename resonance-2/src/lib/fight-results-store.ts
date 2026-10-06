import "server-only";

import { cache } from "react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BLOB_TAGS,
  cachedBlobRead,
  putPrivateBlob,
  readPrivateBlob,
  revalidateBlobTag,
} from "@/lib/blob-read";
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
import { loadFightResults, saveFightResults } from "@/lib/pg/envelopes";
import {
  isStorageUnavailable,
  StorageUnavailableError,
  throwIfStorageForced,
} from "@/lib/storage-unavailable";

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

function finalizeResults(raw: FightResultsEnvelope | null): {
  envelope: FightResultsEnvelope;
  seeded: boolean;
} {
  return ensureSeededFightResults(raw);
}

function parseBlobText(text: string): FightResultsEnvelope | null {
  try {
    return parseFightResultsEnvelope(JSON.parse(text));
  } catch {
    return null;
  }
}

async function persistEnvelope(envelope: FightResultsEnvelope, revalidate: boolean): Promise<void> {
  const backend = detectFightResultsBackend();
  if (backend === "postgres") {
    await saveFightResults(envelope.results);
    if (revalidate) revalidateBlobTag(BLOB_TAGS.fightResults);
    return;
  }
  if (backend === "blob") {
    await putPrivateBlob(FIGHT_RESULTS_BLOB_PATH, JSON.stringify(envelope, null, 2));
    if (revalidate) revalidateBlobTag(BLOB_TAGS.fightResults);
    return;
  }
  if (backend === "file") {
    const target = filePath();
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
    return;
  }
  throw new FightResultsStoreError(
    "Fight result store is not configured. Create a Vercel Blob store and redeploy.",
  );
}

async function readFileEnvelope(): Promise<FightResultsEnvelope | null> {
  try {
    const text = await readFile(filePath(), "utf8");
    if (!text.trim()) return null;
    return parseFightResultsEnvelope(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new StorageUnavailableError(
      "fight-results",
      error instanceof Error ? error.message : "Fight result file could not be read.",
    );
  }
}

async function materializeBlobText(text: string | null, revalidate: boolean): Promise<{
  envelope: FightResultsEnvelope;
  seeded: boolean;
}> {
  const finalized = finalizeResults(text === null ? null : parseBlobText(text));
  if (finalized.seeded) await persistEnvelope(finalized.envelope, revalidate);
  return finalized;
}

type CachedResults =
  | { status: "ok"; envelope: FightResultsEnvelope; seeded: boolean }
  | { status: "unavailable"; reason: string };

async function readResultsPostgres(revalidateWrites: boolean): Promise<CachedResults> {
  try {
    const rows = await loadFightResults();
    const raw =
      rows.length === 0
        ? null
        : parseFightResultsEnvelope({
            version: 1,
            updatedAt: new Date().toISOString(),
            seededAt: null,
            results: rows,
          });
    const finalized = finalizeResults(raw);
    if (finalized.seeded) await persistEnvelope(finalized.envelope, revalidateWrites);
    return { status: "ok", ...finalized };
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      return { status: "unavailable", reason: error.reason };
    }
    return {
      status: "unavailable",
      reason: error instanceof Error ? error.message : "Fight result database could not be read.",
    };
  }
}

async function readResultsBlob(revalidateWrites: boolean): Promise<CachedResults> {
  const body = await readPrivateBlob(FIGHT_RESULTS_BLOB_PATH);
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

function unwrapResults(result: CachedResults): {
  envelope: FightResultsEnvelope;
  seeded: boolean;
} {
  if (result.status === "unavailable") {
    throw new StorageUnavailableError("fight-results", result.reason);
  }
  return result;
}

async function loadResultsFromFile(): Promise<{
  envelope: FightResultsEnvelope;
  seeded: boolean;
}> {
  const finalized = finalizeResults(await readFileEnvelope());
  if (finalized.seeded) await persistEnvelope(finalized.envelope, false);
  return finalized;
}

async function loadFightResultsStoreInner(fresh: boolean): Promise<{
  configured: boolean;
  backend: FightResultsBackend;
  envelope: FightResultsEnvelope;
  seeded: boolean;
}> {
  throwIfStorageForced("fight-results");
  const backend = detectFightResultsBackend();
  if (backend === "none") {
    const seeded = ensureSeededFightResults(null);
    return { configured: false, backend, envelope: seeded.envelope, seeded: true };
  }
  if (backend === "file") {
    const loaded = await loadResultsFromFile();
    return { configured: true, backend, ...loaded };
  }
  if (backend === "postgres") {
    const loaded = fresh
      ? unwrapResults(await readResultsPostgres(true))
      : unwrapResults(
          await cachedBlobRead(BLOB_TAGS.fightResults, () => readResultsPostgres(false)),
        );
    return { configured: true, backend, ...loaded };
  }
  const loaded = fresh
    ? unwrapResults(await readResultsBlob(true))
    : unwrapResults(await cachedBlobRead(BLOB_TAGS.fightResults, () => readResultsBlob(false)));
  return { configured: true, backend, ...loaded };
}

/** Display read. Deduped within a request and cached for 45s across requests. */
export const loadFightResultsStore = cache(() => loadFightResultsStoreInner(false));

/**
 * Read-modify-write. Bypasses the 45s cache so a result post cannot apply
 * onto a stale card. The tag is dropped only after a successful blob put.
 */
export function loadFightResultsStoreFresh(): Promise<{
  configured: boolean;
  backend: FightResultsBackend;
  envelope: FightResultsEnvelope;
  seeded: boolean;
}> {
  return loadFightResultsStoreInner(true);
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
  const loaded = await loadFightResultsStoreFresh();
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
  if (changed) await persistEnvelope(envelope, true);
  return { envelope, backend: loaded.backend, results };
}

export function asFightResultWriteError(error: unknown): {
  status: number;
  message: string;
  reason?: string;
} {
  if (isStorageUnavailable(error)) {
    return { status: 503, message: error.message, reason: error.reason };
  }
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
