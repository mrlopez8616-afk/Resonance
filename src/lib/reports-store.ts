import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ReportsImportError, type OperatorReport } from "./reports";
import {
  createEmptyReportsEnvelope,
  DEFAULT_REPORTS_FILE,
  deleteReportFromEnvelope,
  detectReportsBackend,
  ensureSeededReportsEnvelope,
  findReportById,
  isReportsSyncConfigured,
  listReportsByDay,
  parseReportsEnvelope,
  REPORTS_BLOB_PATH,
  writeReportsIntoEnvelope,
  type ReportsStoreBackend,
  type ReportsStoreEnvelope,
} from "./reports-store-core";

export {
  detectReportsBackend,
  isReportsSyncConfigured,
  type ReportsStoreBackend,
  type ReportsStoreEnvelope,
};

export class ReportsStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportsStoreError";
  }
}

function filePath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.RESONANCE_REPORTS_FILE?.trim();
  return path.resolve(configured || DEFAULT_REPORTS_FILE);
}

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const response = new Response(stream);
  return response.text();
}

async function readBlobEnvelope(): Promise<ReportsStoreEnvelope | null> {
  const { get } = await import("@vercel/blob");
  const result = await get(REPORTS_BLOB_PATH, {
    access: "private",
    useCache: false,
  });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return null;
  }
  const text = await streamToString(result.stream);
  if (!text.trim()) return null;
  try {
    return parseReportsEnvelope(JSON.parse(text));
  } catch {
    return null;
  }
}

async function writeBlobEnvelope(envelope: ReportsStoreEnvelope): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(REPORTS_BLOB_PATH, JSON.stringify(envelope, null, 2), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

async function readFileEnvelope(): Promise<ReportsStoreEnvelope | null> {
  try {
    const text = await readFile(filePath(), "utf8");
    if (!text.trim()) return null;
    return parseReportsEnvelope(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeFileEnvelope(envelope: ReportsStoreEnvelope): Promise<void> {
  const target = filePath();
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
}

async function readRawEnvelope(): Promise<ReportsStoreEnvelope | null> {
  const backend = detectReportsBackend();
  if (backend === "blob") return readBlobEnvelope();
  if (backend === "file") return readFileEnvelope();
  return null;
}

async function persistEnvelope(envelope: ReportsStoreEnvelope): Promise<void> {
  const backend = detectReportsBackend();
  if (backend === "blob") {
    await writeBlobEnvelope(envelope);
    return;
  }
  if (backend === "file") {
    await writeFileEnvelope(envelope);
    return;
  }
  throw new ReportsStoreError(
    "Report sync is not configured. Create a Vercel Blob store and redeploy.",
  );
}

export async function loadReportsStore(): Promise<{
  configured: boolean;
  backend: ReportsStoreBackend;
  envelope: ReportsStoreEnvelope;
  seeded: boolean;
}> {
  const backend = detectReportsBackend();
  if (backend === "none") {
    return {
      configured: false,
      backend,
      envelope: createEmptyReportsEnvelope(),
      seeded: false,
    };
  }
  const raw = await readRawEnvelope();
  const { envelope, seeded } = ensureSeededReportsEnvelope(raw);
  if (seeded) {
    await persistEnvelope(envelope);
  }
  return { configured: true, backend, envelope, seeded };
}

export async function mergeReportsWrite(body: unknown): Promise<{
  envelope: ReportsStoreEnvelope;
  backend: ReportsStoreBackend;
  seeded: boolean;
  filed: OperatorReport[];
}> {
  if (!isReportsSyncConfigured()) {
    throw new ReportsStoreError(
      "Report sync is not configured. Create a Vercel Blob store and redeploy.",
    );
  }
  const items = collectReportWriteItems(body);
  const loaded = await loadReportsStore();
  const beforeIds = new Set(loaded.envelope.reports.map((row) => row.id));
  const envelope = writeReportsIntoEnvelope(loaded.envelope, items);
  await persistEnvelope(envelope);
  const requestedIds = items
    .map((item) => (typeof item.id === "string" ? item.id.trim() : ""))
    .filter(Boolean);
  const filed = envelope.reports.filter(
    (row) => !beforeIds.has(row.id) || requestedIds.includes(row.id),
  );
  return { envelope, backend: loaded.backend, seeded: loaded.seeded, filed };
}

export async function deleteStoredReport(id: string): Promise<{
  envelope: ReportsStoreEnvelope;
  backend: ReportsStoreBackend;
  found: boolean;
}> {
  if (!isReportsSyncConfigured()) {
    throw new ReportsStoreError(
      "Report sync is not configured. Create a Vercel Blob store and redeploy.",
    );
  }
  const loaded = await loadReportsStore();
  const found = loaded.envelope.reports.some((row) => row.id === id);
  const envelope = deleteReportFromEnvelope(loaded.envelope, id);
  await persistEnvelope(envelope);
  return { envelope, backend: loaded.backend, found };
}

export async function loadReportsForDay(dayKey: string): Promise<{
  envelope: ReportsStoreEnvelope;
  backend: ReportsStoreBackend;
  seeded: boolean;
  reports: OperatorReport[];
}> {
  const loaded = await loadReportsStore();
  return {
    ...loaded,
    reports: listReportsByDay(loaded.envelope, dayKey),
  };
}

export async function loadReportById(id: string): Promise<{
  envelope: ReportsStoreEnvelope;
  backend: ReportsStoreBackend;
  seeded: boolean;
  report: OperatorReport | null;
}> {
  const loaded = await loadReportsStore();
  return {
    ...loaded,
    report: findReportById(loaded.envelope, id),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectReportWriteItems(
  body: unknown,
): Array<Partial<OperatorReport> & Record<string, unknown>> {
  if (body == null) {
    throw new ReportsImportError("Expected a JSON object or array.");
  }
  if (Array.isArray(body)) {
    return body.map((item, index) => {
      if (!isRecord(item)) {
        throw new ReportsImportError(`reports[${index}] must be an object.`);
      }
      return item;
    });
  }
  if (!isRecord(body)) {
    throw new ReportsImportError("Expected a JSON object or array.");
  }
  if (Array.isArray(body.reports)) {
    return body.reports.map((item, index) => {
      if (!isRecord(item)) {
        throw new ReportsImportError(`reports[${index}] must be an object.`);
      }
      return item;
    });
  }
  if (typeof body.id === "string" || typeof body.title === "string") {
    return [body];
  }
  throw new ReportsImportError(
    "JSON must include title, a reports array, or a single report object.",
  );
}

export function asReportWriteError(error: unknown): {
  status: number;
  message: string;
} {
  if (error instanceof ReportsImportError) {
    return { status: 400, message: error.message };
  }
  if (error instanceof ReportsStoreError) {
    return { status: 503, message: error.message };
  }
  return {
    status: 500,
    message: error instanceof Error ? error.message : "Report store failed.",
  };
}
