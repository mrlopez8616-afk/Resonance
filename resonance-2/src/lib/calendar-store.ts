import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CalendarWriteError, parseCalendarEvent } from "@/lib/calendar-event";
import {
  CALENDAR_BLOB_PATH,
  DEFAULT_CALENDAR_FILE,
  detectCalendarBackend,
  ensureSeededCalendarEnvelope,
  isCalendarStoreConfigured,
  parseCalendarEnvelope,
  writeCalendarEventIntoEnvelope,
  type CalendarStoreBackend,
  type CalendarStoreEnvelope,
} from "@/lib/calendar-store-core";

export {
  detectCalendarBackend,
  isCalendarStoreConfigured,
  type CalendarStoreBackend,
  type CalendarStoreEnvelope,
};

export class CalendarStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarStoreError";
  }
}

function filePath(env: Record<string, string | undefined> = process.env): string {
  const configured = env.RESONANCE_CALENDAR_FILE?.trim();
  return path.resolve(configured || DEFAULT_CALENDAR_FILE);
}

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const response = new Response(stream);
  return response.text();
}

async function readBlobEnvelope(): Promise<CalendarStoreEnvelope | null> {
  const { get } = await import("@vercel/blob");
  const result = await get(CALENDAR_BLOB_PATH, {
    access: "private",
    useCache: false,
  });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return null;
  }
  const text = await streamToString(result.stream);
  if (!text.trim()) return null;
  try {
    return parseCalendarEnvelope(JSON.parse(text));
  } catch {
    return null;
  }
}

async function writeBlobEnvelope(envelope: CalendarStoreEnvelope): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(CALENDAR_BLOB_PATH, JSON.stringify(envelope, null, 2), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

async function readFileEnvelope(): Promise<CalendarStoreEnvelope | null> {
  try {
    const text = await readFile(filePath(), "utf8");
    if (!text.trim()) return null;
    return parseCalendarEnvelope(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeFileEnvelope(envelope: CalendarStoreEnvelope): Promise<void> {
  const target = filePath();
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
}

async function readRawEnvelope(): Promise<CalendarStoreEnvelope | null> {
  const backend = detectCalendarBackend();
  if (backend === "blob") return readBlobEnvelope();
  if (backend === "file") return readFileEnvelope();
  return null;
}

async function persistEnvelope(envelope: CalendarStoreEnvelope): Promise<void> {
  const backend = detectCalendarBackend();
  if (backend === "blob") {
    await writeBlobEnvelope(envelope);
    return;
  }
  if (backend === "file") {
    await writeFileEnvelope(envelope);
    return;
  }
  throw new CalendarStoreError(
    "Calendar store is not configured. Create a Vercel Blob store and redeploy.",
  );
}

export async function loadCalendarStore(): Promise<{
  configured: boolean;
  backend: CalendarStoreBackend;
  envelope: CalendarStoreEnvelope;
  seeded: boolean;
}> {
  const backend = detectCalendarBackend();
  if (backend === "none") {
    return {
      configured: false,
      backend,
      envelope: ensureSeededCalendarEnvelope(null).envelope,
      seeded: true,
    };
  }
  const raw = await readRawEnvelope();
  const { envelope, seeded } = ensureSeededCalendarEnvelope(raw);
  if (seeded) {
    await persistEnvelope(envelope);
  }
  return { configured: true, backend, envelope, seeded };
}

export async function writeStoredCalendarEvent(body: unknown): Promise<{
  envelope: CalendarStoreEnvelope;
  backend: CalendarStoreBackend;
  seeded: boolean;
  event: ReturnType<typeof writeCalendarEventIntoEnvelope>["event"];
  deduped: boolean;
  updated: boolean;
}> {
  if (!isCalendarStoreConfigured()) {
    throw new CalendarStoreError(
      "Calendar store is not configured. Create a Vercel Blob store and redeploy.",
    );
  }
  const event = parseCalendarEvent(body);
  const loaded = await loadCalendarStore();
  const written = writeCalendarEventIntoEnvelope(loaded.envelope, event);
  if (!written.deduped) {
    await persistEnvelope(written.envelope);
  }
  return {
    envelope: written.envelope,
    backend: loaded.backend,
    seeded: loaded.seeded,
    event: written.event,
    deduped: written.deduped,
    updated: written.updated,
  };
}

export function asCalendarWriteError(error: unknown): {
  status: number;
  message: string;
} {
  if (error instanceof CalendarWriteError) {
    return { status: error.status, message: error.message };
  }
  if (error instanceof CalendarStoreError) {
    return { status: 503, message: error.message };
  }
  return {
    status: 500,
    message: error instanceof Error ? error.message : "Calendar store failed.",
  };
}
