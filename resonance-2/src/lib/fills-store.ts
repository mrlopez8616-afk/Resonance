import "server-only";

import { cache } from "react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { FillIngestError, parseFillEvent } from "./fill-event";
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
  DEFAULT_FILLS_FILE,
  detectFillsBackend,
  ensureSeededFillsEnvelope,
  FILLS_BLOB_PATH,
  ingestFillIntoEnvelope,
  isFillsStoreConfigured,
  parseFillsEnvelope,
  type FillsStoreBackend,
  type FillsStoreEnvelope,
} from "./fills-store-core";
import { loadFillsEnvelope, saveFillsEnvelope } from "@/lib/pg/envelopes";
import { mergeSleeveBook, seedBookForTicker } from "./sleeve-apply";
import type { NodeSleeve } from "@/data/sleeves";

export {
  detectFillsBackend,
  isFillsStoreConfigured,
  type FillsStoreBackend,
  type FillsStoreEnvelope,
};

export class FillsStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FillsStoreError";
  }
}

function filePath(env: Record<string, string | undefined> = process.env): string {
  const configured = env.RESONANCE_FILLS_FILE?.trim();
  return path.resolve(configured || DEFAULT_FILLS_FILE);
}

function finalizeFills(raw: FillsStoreEnvelope | null): {
  envelope: FillsStoreEnvelope;
  seeded: boolean;
} {
  return ensureSeededFillsEnvelope(raw);
}

function parseBlobText(text: string): FillsStoreEnvelope | null {
  try {
    return parseFillsEnvelope(JSON.parse(text));
  } catch {
    return null;
  }
}

async function persistEnvelope(envelope: FillsStoreEnvelope, revalidate: boolean): Promise<void> {
  const backend = detectFillsBackend();
  if (backend === "postgres") {
    await saveFillsEnvelope(envelope);
    if (revalidate) revalidateBlobTag(BLOB_TAGS.fills);
    return;
  }
  if (backend === "blob") {
    await putPrivateBlob(FILLS_BLOB_PATH, JSON.stringify(envelope, null, 2));
    if (revalidate) revalidateBlobTag(BLOB_TAGS.fills);
    return;
  }
  if (backend === "file") {
    const target = filePath();
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
    return;
  }
  throw new FillsStoreError(
    "Fill ingest is not configured. Create a Vercel Blob store and redeploy.",
  );
}

async function readFileEnvelope(): Promise<FillsStoreEnvelope | null> {
  try {
    const text = await readFile(filePath(), "utf8");
    if (!text.trim()) return null;
    return parseFillsEnvelope(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new StorageUnavailableError(
      "fills",
      error instanceof Error ? error.message : "Fill file could not be read.",
    );
  }
}

async function materializeBlobText(text: string | null, revalidate: boolean): Promise<{
  envelope: FillsStoreEnvelope;
  seeded: boolean;
}> {
  const finalized = finalizeFills(text === null ? null : parseBlobText(text));
  if (finalized.seeded) await persistEnvelope(finalized.envelope, revalidate);
  return finalized;
}

type CachedFills =
  | { status: "ok"; envelope: FillsStoreEnvelope; seeded: boolean }
  | { status: "unavailable"; reason: string };

async function readFillsPostgres(revalidateWrites: boolean): Promise<CachedFills> {
  try {
    const finalized = finalizeFills(await loadFillsEnvelope());
    if (finalized.seeded) await persistEnvelope(finalized.envelope, revalidateWrites);
    return { status: "ok", ...finalized };
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      return { status: "unavailable", reason: error.reason };
    }
    return {
      status: "unavailable",
      reason: error instanceof Error ? error.message : "Fill database could not be read.",
    };
  }
}

async function readFillsBlob(revalidateWrites: boolean): Promise<CachedFills> {
  const body = await readPrivateBlob(FILLS_BLOB_PATH);
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

function unwrapFills(result: CachedFills): { envelope: FillsStoreEnvelope; seeded: boolean } {
  if (result.status === "unavailable") {
    throw new StorageUnavailableError("fills", result.reason);
  }
  return result;
}

async function loadFillsStoreInner(fresh: boolean): Promise<{
  configured: boolean;
  backend: FillsStoreBackend;
  envelope: FillsStoreEnvelope;
  seeded: boolean;
}> {
  throwIfStorageForced("fills");
  const backend = detectFillsBackend();
  if (backend === "none") {
    return {
      configured: false,
      backend,
      envelope: ensureSeededFillsEnvelope(null).envelope,
      seeded: true,
    };
  }
  if (backend === "postgres") {
    const loaded = fresh
      ? unwrapFills(await readFillsPostgres(true))
      : unwrapFills(await cachedBlobRead(BLOB_TAGS.fills, () => readFillsPostgres(false)));
    return { configured: true, backend, ...loaded };
  }
  if (backend === "file") {
    const raw = await readFileEnvelope();
    const finalized = finalizeFills(raw);
    if (finalized.seeded) await persistEnvelope(finalized.envelope, false);
    return { configured: true, backend, ...finalized };
  }
  const loaded = fresh
    ? unwrapFills(await readFillsBlob(true))
    : unwrapFills(await cachedBlobRead(BLOB_TAGS.fills, () => readFillsBlob(false)));
  return { configured: true, backend, ...loaded };
}

export const loadFillsStore = cache(() => loadFillsStoreInner(false));

export function loadFillsStoreFresh(): Promise<{
  configured: boolean;
  backend: FillsStoreBackend;
  envelope: FillsStoreEnvelope;
  seeded: boolean;
}> {
  return loadFillsStoreInner(true);
}

export async function ingestStoredFill(body: unknown): Promise<{
  envelope: FillsStoreEnvelope;
  backend: FillsStoreBackend;
  seeded: boolean;
  fill: ReturnType<typeof ingestFillIntoEnvelope>["fill"];
  deduped: boolean;
  applied: boolean;
  backfill?: true;
}> {
  if (!isFillsStoreConfigured()) {
    throw new FillsStoreError(
      "Fill ingest is not configured. Create a Vercel Blob store and redeploy.",
    );
  }
  const event = parseFillEvent(body);
  const loaded = await loadFillsStoreFresh();
  const written = ingestFillIntoEnvelope(loaded.envelope, event);
  if (!written.deduped) {
    await persistEnvelope(written.envelope, true);
  }
  return {
    envelope: written.envelope,
    backend: loaded.backend,
    seeded: loaded.seeded,
    fill: written.fill,
    deduped: written.deduped,
    applied: written.applied,
    ...(written.backfill ? { backfill: true as const } : {}),
  };
}

export function liveSleevesFromEnvelope(
  envelope: FillsStoreEnvelope,
  ticker: string,
): NodeSleeve[] | null {
  const seed = seedBookForTicker(ticker);
  if (!seed) return null;
  return mergeSleeveBook(ticker, envelope.sleevePrints, seed);
}

export function asFillWriteError(error: unknown): {
  status: number;
  message: string;
  reason?: string;
} {
  if (isStorageUnavailable(error)) {
    return { status: 503, message: error.message, reason: error.reason };
  }
  if (error instanceof FillIngestError) {
    return { status: error.status, message: error.message };
  }
  if (error instanceof FillsStoreError) {
    return { status: 503, message: error.message };
  }
  return {
    status: 500,
    message: error instanceof Error ? error.message : "Fill store failed.",
  };
}
