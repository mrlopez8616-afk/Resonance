import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  collectWriteItems,
  DecisionWriteError,
} from "./decision-write";
import {
  createEmptyEnvelope,
  DEFAULT_DECISIONS_FILE,
  DECISIONS_BLOB_PATH,
  deleteDecisionFromEnvelope,
  detectDecisionsBackend,
  ensureSeededEnvelope,
  isDecisionsSyncConfigured,
  parseDecisionsEnvelope,
  writeDecisionsIntoEnvelope,
  type DecisionsStoreBackend,
  type DecisionsStoreEnvelope,
} from "./decisions-store-core";

export {
  detectDecisionsBackend,
  isDecisionsSyncConfigured,
  type DecisionsStoreBackend,
  type DecisionsStoreEnvelope,
};

export class DecisionsStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionsStoreError";
  }
}

function filePath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.RESONANCE_DECISIONS_FILE?.trim();
  return path.resolve(configured || DEFAULT_DECISIONS_FILE);
}

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const response = new Response(stream);
  return response.text();
}

async function readBlobEnvelope(): Promise<DecisionsStoreEnvelope | null> {
  const { get } = await import("@vercel/blob");
  const result = await get(DECISIONS_BLOB_PATH, {
    access: "private",
    useCache: false,
  });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return null;
  }
  const text = await streamToString(result.stream);
  if (!text.trim()) return null;
  try {
    return parseDecisionsEnvelope(JSON.parse(text));
  } catch {
    return null;
  }
}

async function writeBlobEnvelope(envelope: DecisionsStoreEnvelope): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(DECISIONS_BLOB_PATH, JSON.stringify(envelope, null, 2), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

async function readFileEnvelope(): Promise<DecisionsStoreEnvelope | null> {
  try {
    const text = await readFile(filePath(), "utf8");
    if (!text.trim()) return null;
    return parseDecisionsEnvelope(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeFileEnvelope(envelope: DecisionsStoreEnvelope): Promise<void> {
  const target = filePath();
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
}

async function readRawEnvelope(): Promise<DecisionsStoreEnvelope | null> {
  const backend = detectDecisionsBackend();
  if (backend === "blob") return readBlobEnvelope();
  if (backend === "file") return readFileEnvelope();
  return null;
}

async function persistEnvelope(envelope: DecisionsStoreEnvelope): Promise<void> {
  const backend = detectDecisionsBackend();
  if (backend === "blob") {
    await writeBlobEnvelope(envelope);
    return;
  }
  if (backend === "file") {
    await writeFileEnvelope(envelope);
    return;
  }
  throw new DecisionsStoreError(
    "Decision sync is not configured. Create a Vercel Blob store and redeploy.",
  );
}

export async function loadDecisionsStore(): Promise<{
  configured: boolean;
  backend: DecisionsStoreBackend;
  envelope: DecisionsStoreEnvelope;
  seeded: boolean;
}> {
  const backend = detectDecisionsBackend();
  if (backend === "none") {
    return {
      configured: false,
      backend,
      envelope: createEmptyEnvelope(),
      seeded: false,
    };
  }
  const raw = await readRawEnvelope();
  const { envelope, seeded } = ensureSeededEnvelope(raw);
  if (seeded) {
    await persistEnvelope(envelope);
  }
  return { configured: true, backend, envelope, seeded };
}

export async function mergeDecisionsWrite(body: unknown): Promise<{
  envelope: DecisionsStoreEnvelope;
  backend: DecisionsStoreBackend;
  seeded: boolean;
}> {
  if (!isDecisionsSyncConfigured()) {
    throw new DecisionsStoreError(
      "Decision sync is not configured. Create a Vercel Blob store and redeploy.",
    );
  }
  const items = collectWriteItems(body);
  const loaded = await loadDecisionsStore();
  const envelope = writeDecisionsIntoEnvelope(loaded.envelope, items);
  await persistEnvelope(envelope);
  return { envelope, backend: loaded.backend, seeded: loaded.seeded };
}

export async function deleteStoredDecision(id: string): Promise<{
  envelope: DecisionsStoreEnvelope;
  backend: DecisionsStoreBackend;
  found: boolean;
}> {
  if (!isDecisionsSyncConfigured()) {
    throw new DecisionsStoreError(
      "Decision sync is not configured. Create a Vercel Blob store and redeploy.",
    );
  }
  const loaded = await loadDecisionsStore();
  const found = loaded.envelope.decisions.some((row) => row.id === id);
  const envelope = deleteDecisionFromEnvelope(loaded.envelope, id);
  await persistEnvelope(envelope);
  return { envelope, backend: loaded.backend, found };
}

export function asWriteError(error: unknown): { status: number; message: string } {
  if (error instanceof DecisionWriteError) {
    return { status: 400, message: error.message };
  }
  if (error instanceof DecisionsStoreError) {
    return { status: 503, message: error.message };
  }
  return {
    status: 500,
    message: error instanceof Error ? error.message : "Decision store failed.",
  };
}
