import "server-only";

import { cache } from "react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CalendarWriteError, parseCalendarEvent } from "@/lib/calendar-event";
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
import { loadCalendarEnvelope, saveCalendarEnvelope } from "@/lib/pg/envelopes";

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

function parseBlobText(text: string): CalendarStoreEnvelope | null {
  try {
    return parseCalendarEnvelope(JSON.parse(text));
  } catch {
    return null;
  }
}

async function persistEnvelope(
  envelope: CalendarStoreEnvelope,
  revalidate: boolean,
): Promise<void> {
  const backend = detectCalendarBackend();
  if (backend === "postgres") {
    await saveCalendarEnvelope(envelope);
    if (revalidate) revalidateBlobTag(BLOB_TAGS.calendar);
    return;
  }
  if (backend === "blob") {
    await putPrivateBlob(CALENDAR_BLOB_PATH, JSON.stringify(envelope, null, 2));
    if (revalidate) revalidateBlobTag(BLOB_TAGS.calendar);
    return;
  }
  if (backend === "file") {
    const target = filePath();
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
    return;
  }
  throw new CalendarStoreError(
    "Calendar store is not configured. Create a Vercel Blob store and redeploy.",
  );
}

async function readFileEnvelope(): Promise<CalendarStoreEnvelope | null> {
  try {
    const text = await readFile(filePath(), "utf8");
    if (!text.trim()) return null;
    return parseCalendarEnvelope(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new StorageUnavailableError(
      "calendar",
      error instanceof Error ? error.message : "Calendar file could not be read.",
    );
  }
}

async function materializeBlobText(text: string | null, revalidate: boolean): Promise<{
  envelope: CalendarStoreEnvelope;
  seeded: boolean;
}> {
  const finalized = ensureSeededCalendarEnvelope(text === null ? null : parseBlobText(text));
  if (finalized.seeded) await persistEnvelope(finalized.envelope, revalidate);
  return finalized;
}

type CachedCalendar =
  | { status: "ok"; envelope: CalendarStoreEnvelope; seeded: boolean }
  | { status: "unavailable"; reason: string };

async function readCalendarPostgres(revalidateWrites: boolean): Promise<CachedCalendar> {
  try {
    const finalized = ensureSeededCalendarEnvelope(await loadCalendarEnvelope());
    if (finalized.seeded) await persistEnvelope(finalized.envelope, revalidateWrites);
    return { status: "ok", ...finalized };
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      return { status: "unavailable", reason: error.reason };
    }
    return {
      status: "unavailable",
      reason: error instanceof Error ? error.message : "Calendar database could not be read.",
    };
  }
}

async function readCalendarBlob(revalidateWrites: boolean): Promise<CachedCalendar> {
  const body = await readPrivateBlob(CALENDAR_BLOB_PATH);
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

function unwrapCalendar(result: CachedCalendar): {
  envelope: CalendarStoreEnvelope;
  seeded: boolean;
} {
  if (result.status === "unavailable") {
    throw new StorageUnavailableError("calendar", result.reason);
  }
  return result;
}

async function loadCalendarStoreInner(fresh: boolean): Promise<{
  configured: boolean;
  backend: CalendarStoreBackend;
  envelope: CalendarStoreEnvelope;
  seeded: boolean;
}> {
  throwIfStorageForced("calendar");
  const backend = detectCalendarBackend();
  if (backend === "none") {
    return {
      configured: false,
      backend,
      envelope: ensureSeededCalendarEnvelope(null).envelope,
      seeded: true,
    };
  }
  if (backend === "postgres") {
    const loaded = fresh
      ? unwrapCalendar(await readCalendarPostgres(true))
      : unwrapCalendar(
          await cachedBlobRead(BLOB_TAGS.calendar, () => readCalendarPostgres(false)),
        );
    return { configured: true, backend, ...loaded };
  }
  if (backend === "file") {
    const finalized = ensureSeededCalendarEnvelope(await readFileEnvelope());
    if (finalized.seeded) await persistEnvelope(finalized.envelope, false);
    return { configured: true, backend, envelope: finalized.envelope, seeded: finalized.seeded };
  }
  const loaded = fresh
    ? unwrapCalendar(await readCalendarBlob(true))
    : unwrapCalendar(
        await cachedBlobRead(BLOB_TAGS.calendar, () => readCalendarBlob(false)),
      );
  return { configured: true, backend, ...loaded };
}

export const loadCalendarStore = cache(() => loadCalendarStoreInner(false));

export function loadCalendarStoreFresh(): Promise<{
  configured: boolean;
  backend: CalendarStoreBackend;
  envelope: CalendarStoreEnvelope;
  seeded: boolean;
}> {
  return loadCalendarStoreInner(true);
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
  const loaded = await loadCalendarStoreFresh();
  const written = writeCalendarEventIntoEnvelope(loaded.envelope, event);
  if (!written.deduped) {
    await persistEnvelope(written.envelope, true);
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
  reason?: string;
} {
  if (isStorageUnavailable(error)) {
    return { status: 503, message: error.message, reason: error.reason };
  }
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
