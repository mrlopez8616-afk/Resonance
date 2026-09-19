import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { FillIngestError, parseFillEvent } from "./fill-event";
import {
  createEmptyFillsEnvelope,
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

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const response = new Response(stream);
  return response.text();
}

async function readBlobEnvelope(): Promise<FillsStoreEnvelope | null> {
  const { get } = await import("@vercel/blob");
  const result = await get(FILLS_BLOB_PATH, {
    access: "private",
    useCache: false,
  });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return null;
  }
  const text = await streamToString(result.stream);
  if (!text.trim()) return null;
  try {
    return parseFillsEnvelope(JSON.parse(text));
  } catch {
    return null;
  }
}

async function writeBlobEnvelope(envelope: FillsStoreEnvelope): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(FILLS_BLOB_PATH, JSON.stringify(envelope, null, 2), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

async function readFileEnvelope(): Promise<FillsStoreEnvelope | null> {
  try {
    const text = await readFile(filePath(), "utf8");
    if (!text.trim()) return null;
    return parseFillsEnvelope(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeFileEnvelope(envelope: FillsStoreEnvelope): Promise<void> {
  const target = filePath();
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
}

async function readRawEnvelope(): Promise<FillsStoreEnvelope | null> {
  const backend = detectFillsBackend();
  if (backend === "blob") return readBlobEnvelope();
  if (backend === "file") return readFileEnvelope();
  return null;
}

async function persistEnvelope(envelope: FillsStoreEnvelope): Promise<void> {
  const backend = detectFillsBackend();
  if (backend === "blob") {
    await writeBlobEnvelope(envelope);
    return;
  }
  if (backend === "file") {
    await writeFileEnvelope(envelope);
    return;
  }
  throw new FillsStoreError(
    "Fill ingest is not configured. Create a Vercel Blob store and redeploy.",
  );
}

export async function loadFillsStore(): Promise<{
  configured: boolean;
  backend: FillsStoreBackend;
  envelope: FillsStoreEnvelope;
  seeded: boolean;
}> {
  const backend = detectFillsBackend();
  if (backend === "none") {
    return {
      configured: false,
      backend,
      envelope: ensureSeededFillsEnvelope(null).envelope,
      seeded: true,
    };
  }
  const raw = await readRawEnvelope();
  const { envelope, seeded } = ensureSeededFillsEnvelope(raw);
  if (seeded) {
    await persistEnvelope(envelope);
  }
  return { configured: true, backend, envelope, seeded };
}

export async function ingestStoredFill(body: unknown): Promise<{
  envelope: FillsStoreEnvelope;
  backend: FillsStoreBackend;
  seeded: boolean;
  fill: ReturnType<typeof ingestFillIntoEnvelope>["fill"];
  deduped: boolean;
  applied: boolean;
}> {
  if (!isFillsStoreConfigured()) {
    throw new FillsStoreError(
      "Fill ingest is not configured. Create a Vercel Blob store and redeploy.",
    );
  }
  const event = parseFillEvent(body);
  const loaded = await loadFillsStore();
  const written = ingestFillIntoEnvelope(loaded.envelope, event);
  if (!written.deduped) {
    await persistEnvelope(written.envelope);
  }
  return {
    envelope: written.envelope,
    backend: loaded.backend,
    seeded: loaded.seeded,
    fill: written.fill,
    deduped: written.deduped,
    applied: written.applied,
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
} {
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
