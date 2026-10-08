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
import {
  applyBreakdowns,
  BreakdownWriteError,
  type BreakdownWriteResult,
  type FightBreakdown,
} from "@/lib/fight-breakdowns";
import {
  BREAKDOWNS_BLOB_PATH,
  createEmptyBreakdownsEnvelope,
  DEFAULT_BREAKDOWNS_FILE,
  detectFightBreakdownsBackend,
  isFightBreakdownsStoreConfigured,
  parseBreakdownsEnvelope,
  type FightBreakdownsBackend,
  type FightBreakdownsEnvelope,
} from "@/lib/fight-breakdowns-store-core";
import { loadFightBreakdowns, saveFightBreakdowns } from "@/lib/pg/envelopes";
import {
  isStorageUnavailable,
  StorageUnavailableError,
  throwIfStorageForced,
} from "@/lib/storage-unavailable";

export {
  detectFightBreakdownsBackend,
  isFightBreakdownsStoreConfigured,
  type FightBreakdownsBackend,
  type FightBreakdownsEnvelope,
};

export class FightBreakdownsStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FightBreakdownsStoreError";
  }
}

function filePath(env: Record<string, string | undefined> = process.env): string {
  const configured = env.RESONANCE_FIGHT_BREAKDOWNS_FILE?.trim();
  return path.resolve(configured || DEFAULT_BREAKDOWNS_FILE);
}

function parseBlobText(text: string): FightBreakdownsEnvelope | null {
  try {
    return parseBreakdownsEnvelope(JSON.parse(text));
  } catch {
    return null;
  }
}

async function persistEnvelope(envelope: FightBreakdownsEnvelope, revalidate: boolean): Promise<void> {
  const backend = detectFightBreakdownsBackend();
  if (backend === "postgres") {
    await saveFightBreakdowns(envelope);
    if (revalidate) revalidateBlobTag(BLOB_TAGS.fightBreakdowns);
    return;
  }
  if (backend === "blob") {
    await putPrivateBlob(BREAKDOWNS_BLOB_PATH, JSON.stringify(envelope, null, 2));
    if (revalidate) revalidateBlobTag(BLOB_TAGS.fightBreakdowns);
    return;
  }
  if (backend === "file") {
    const target = filePath();
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
    return;
  }
  throw new FightBreakdownsStoreError(
    "Fight breakdown store is not configured. Create a Vercel Blob store and redeploy.",
  );
}

async function readFileEnvelope(): Promise<FightBreakdownsEnvelope | null> {
  try {
    const text = await readFile(filePath(), "utf8");
    if (!text.trim()) return null;
    return parseBreakdownsEnvelope(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new StorageUnavailableError(
      "fight-breakdowns",
      error instanceof Error ? error.message : "Fight breakdown file could not be read.",
    );
  }
}

type CachedBreakdowns =
  | { status: "ok"; envelope: FightBreakdownsEnvelope }
  | { status: "unavailable"; reason: string };

async function readBreakdownsPostgres(): Promise<CachedBreakdowns> {
  try {
    const envelope = await loadFightBreakdowns();
    return { status: "ok", envelope };
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      return { status: "unavailable", reason: error.reason };
    }
    return {
      status: "unavailable",
      reason: error instanceof Error ? error.message : "Fight breakdown database could not be read.",
    };
  }
}

async function readBreakdownsBlob(): Promise<CachedBreakdowns> {
  const body = await readPrivateBlob(BREAKDOWNS_BLOB_PATH);
  if (body.status === "unavailable") return body;
  if (body.status === "missing") {
    return { status: "ok", envelope: createEmptyBreakdownsEnvelope() };
  }
  const parsed = parseBlobText(body.text);
  if (!parsed) {
    return { status: "unavailable", reason: "Fight breakdown blob could not be read." };
  }
  return { status: "ok", envelope: parsed };
}

function unwrap(result: CachedBreakdowns): FightBreakdownsEnvelope {
  if (result.status === "unavailable") {
    throw new StorageUnavailableError("fight-breakdowns", result.reason);
  }
  return result.envelope;
}

async function loadFightBreakdownsStoreInner(fresh: boolean): Promise<{
  configured: boolean;
  backend: FightBreakdownsBackend;
  envelope: FightBreakdownsEnvelope;
}> {
  throwIfStorageForced("fight-breakdowns");
  const backend = detectFightBreakdownsBackend();
  if (backend === "none") {
    return { configured: false, backend, envelope: createEmptyBreakdownsEnvelope() };
  }
  if (backend === "file") {
    const envelope = (await readFileEnvelope()) ?? createEmptyBreakdownsEnvelope();
    return { configured: true, backend, envelope };
  }
  if (backend === "postgres") {
    const envelope = fresh
      ? unwrap(await readBreakdownsPostgres())
      : unwrap(await cachedBlobRead(BLOB_TAGS.fightBreakdowns, () => readBreakdownsPostgres()));
    return { configured: true, backend, envelope };
  }
  const envelope = fresh
    ? unwrap(await readBreakdownsBlob())
    : unwrap(await cachedBlobRead(BLOB_TAGS.fightBreakdowns, () => readBreakdownsBlob()));
  return { configured: true, backend, envelope };
}

/** Display read. Deduped within a request and cached for 45s across requests. */
export const loadFightBreakdownsStore = cache(() => loadFightBreakdownsStoreInner(false));

/** Read-modify-write. Bypasses the 45s cache so a post cannot apply onto a stale card. */
export function loadFightBreakdownsStoreFresh(): Promise<{
  configured: boolean;
  backend: FightBreakdownsBackend;
  envelope: FightBreakdownsEnvelope;
}> {
  return loadFightBreakdownsStoreInner(true);
}

export async function postFightBreakdowns(incoming: readonly FightBreakdown[]): Promise<{
  envelope: FightBreakdownsEnvelope;
  backend: FightBreakdownsBackend;
  results: BreakdownWriteResult[];
}> {
  if (!isFightBreakdownsStoreConfigured()) {
    throw new FightBreakdownsStoreError(
      "Fight breakdown store is not configured. Create a Vercel Blob store and redeploy.",
    );
  }
  const loaded = await loadFightBreakdownsStoreFresh();
  const applied = applyBreakdowns(loaded.envelope.breakdowns, incoming);
  const envelope: FightBreakdownsEnvelope = applied.changed
    ? {
        ...loaded.envelope,
        updatedAt: new Date().toISOString(),
        breakdowns: applied.rows,
      }
    : loaded.envelope;
  if (applied.changed) await persistEnvelope(envelope, true);
  return { envelope, backend: loaded.backend, results: applied.results };
}

export function asBreakdownWriteError(error: unknown): {
  status: number;
  message: string;
  reason?: string;
} {
  if (isStorageUnavailable(error)) {
    return { status: 503, message: error.message, reason: error.reason };
  }
  if (error instanceof BreakdownWriteError) {
    return { status: error.status, message: error.message };
  }
  if (error instanceof FightBreakdownsStoreError) {
    return { status: 503, message: error.message };
  }
  return {
    status: 500,
    message: error instanceof Error ? error.message : "Fight breakdown store failed.",
  };
}
