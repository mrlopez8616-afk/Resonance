import { revalidateTag, unstable_cache } from "next/cache";
import {
  StorageUnavailableError,
  blobFailureReason,
  isBlobMissingError,
  isStorageUnavailable,
  throwIfStorageForced,
} from "@/lib/storage-unavailable";

/** Shared server cache window for the private JSON blobs. */
export const BLOB_READ_REVALIDATE_SECONDS = 45;

export const BLOB_TAGS = {
  bets: "resonance-blob-bets",
  fills: "resonance-blob-fills",
  calendar: "resonance-blob-calendar",
  fightResults: "resonance-blob-fight-results",
  fightBreakdowns: "resonance-blob-fight-breakdowns",
  bankrollDeposits: "resonance-bankroll-deposits",
} as const;

export type BlobTag = (typeof BLOB_TAGS)[keyof typeof BLOB_TAGS];

export type BlobText =
  | { status: "ok"; text: string }
  | { status: "missing" }
  | { status: "unavailable"; reason: string };

type BlobGet = (
  pathname: string,
  options: { access: "private"; useCache: boolean },
) => Promise<{ statusCode?: number; stream: ReadableStream<Uint8Array> | null } | null>;

type BlobPut = (
  pathname: string,
  body: string,
  options: {
    access: "private";
    allowOverwrite: boolean;
    addRandomSuffix: boolean;
    contentType: string;
    cacheControlMaxAge: number;
  },
) => Promise<unknown>;

type BlobSdk = { get: BlobGet; put: BlobPut };

let sdkOverride: BlobSdk | null = null;

const memory = new Map<string, { expires: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
const nextReaders = new Map<string, () => Promise<unknown>>();
const lastGood = new Map<string, unknown>();

export function setBlobSdkForTests(sdk: BlobSdk | null): void {
  sdkOverride = sdk;
}

/** Drops the 45s window. The last successful read stays, so the next miss can go stale. */
export function expireReadCacheForTests(): void {
  memory.clear();
  inflight.clear();
}

export function resetBlobReadCacheForTests(): void {
  memory.clear();
  inflight.clear();
  nextReaders.clear();
  lastGood.clear();
}

export function resultIsStale(value: unknown): boolean {
  return Boolean(value) && typeof value === "object" && (value as { stale?: unknown }).stale === true;
}

async function sdk(): Promise<BlobSdk> {
  if (sdkOverride) return sdkOverride;
  const blob = await import("@vercel/blob");
  return { get: blob.get as BlobGet, put: blob.put as BlobPut };
}

/**
 * Origin read. `useCache: false` skips the Blob CDN.
 *
 * The CDN cache is not cleared by `revalidateTag`. A display read that
 * accepted it would copy a pre-write body into the Next data cache after a
 * settle and keep it for another TTL. The Next cache (45s, one tag per blob)
 * is the layer that absorbs repeat page views; this fetch only runs on a miss
 * or after a write invalidates the tag.
 */
export async function readPrivateBlob(pathname: string): Promise<BlobText> {
  try {
    throwIfStorageForced(pathname);
    const { get } = await sdk();
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result || result.statusCode === 404) return { status: "missing" };
    if (result.statusCode !== undefined && result.statusCode !== 200) {
      return {
        status: "unavailable",
        reason: `Blob store returned ${result.statusCode}.`,
      };
    }
    if (!result.stream) return { status: "missing" };
    const text = await new Response(result.stream).text();
    if (!text.trim()) return { status: "missing" };
    return { status: "ok", text };
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      return { status: "unavailable", reason: error.reason };
    }
    if (isBlobMissingError(error)) return { status: "missing" };
    return { status: "unavailable", reason: blobFailureReason(error) };
  }
}

export async function putPrivateBlob(pathname: string, body: string): Promise<void> {
  try {
    throwIfStorageForced(pathname);
    const { put } = await sdk();
    await put(pathname, body, {
      access: "private",
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: "application/json",
      cacheControlMaxAge: 60,
    });
  } catch (error) {
    if (error instanceof StorageUnavailableError) throw error;
    throw new StorageUnavailableError(pathname, blobFailureReason(error));
  }
}

function remember<T>(tag: string, value: T): void {
  memory.set(tag, {
    value,
    expires: Date.now() + BLOB_READ_REVALIDATE_SECONDS * 1000,
  });
}

function recall<T>(tag: string): T | undefined {
  const hit = memory.get(tag);
  if (!hit) return undefined;
  if (hit.expires <= Date.now()) {
    memory.delete(tag);
    return undefined;
  }
  return hit.value as T;
}

function unavailableReason(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { status?: unknown; reason?: unknown };
  if (record.status !== "unavailable") return null;
  return typeof record.reason === "string" && record.reason.trim() ? record.reason : "Storage read failed.";
}

function rememberGood<T>(tag: string, value: T): void {
  if (!value || typeof value !== "object") return;
  if ((value as { status?: unknown }).status !== "ok") return;
  if ((value as { stale?: unknown }).stale === true) return;
  lastGood.set(tag, value);
}

function withStale<T>(value: T): T {
  if (value && typeof value === "object") return { ...(value as object), stale: true } as T;
  return value;
}

async function readGuarded<T>(tag: string, fresh: () => Promise<T>): Promise<T> {
  const value = await fresh();
  const reason = unavailableReason(value);
  if (reason !== null) throw new StorageUnavailableError(tag, reason);
  return value;
}

async function readThroughMemory<T>(tag: string, fresh: () => Promise<T>): Promise<T> {
  const hit = recall<T>(tag);
  if (hit !== undefined) return hit;
  const pending = inflight.get(tag);
  if (pending) return pending as Promise<T>;
  const run = fresh()
    .then((value) => {
      remember(tag, value);
      inflight.delete(tag);
      return value;
    })
    .catch((error: unknown) => {
      inflight.delete(tag);
      throw error;
    });
  inflight.set(tag, run);
  return run;
}

/**
 * 45s Next data cache when this process is a Next server. Tests and CLI
 * scripts have no incremental cache, so they use the same TTL in-process.
 * Either way a tag drop forces the next read to call `fresh`.
 */
async function readCached<T>(tag: string, fresh: () => Promise<T>): Promise<T> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    let run = nextReaders.get(tag) as (() => Promise<T>) | undefined;
    if (!run) {
      const cached = unstable_cache(fresh, [tag], {
        revalidate: BLOB_READ_REVALIDATE_SECONDS,
        tags: [tag],
      });
      run = () => cached();
      nextReaders.set(tag, run as () => Promise<unknown>);
    }
    return run();
  }
  return readThroughMemory(tag, fresh);
}

/**
 * A failed read is not stored. The next request tries again.
 * When an earlier read succeeded, that copy is returned with stale set
 * and the page keeps the last good rows.
 */
export async function cachedBlobRead<T>(tag: string, fresh: () => Promise<T>): Promise<T> {
  try {
    const value = await readCached(tag, () => readGuarded(tag, fresh));
    rememberGood(tag, value);
    return value;
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    const previous = lastGood.get(tag) as T | undefined;
    if (previous === undefined) throw error;
    return withStale(previous);
  }
}

export function revalidateBlobTag(tag: string): void {
  memory.delete(tag);
  inflight.delete(tag);
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    revalidateTag(tag, { expire: 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message.includes("static generation store missing") ||
      message.includes("during render") ||
      message.includes("unstable_cache") ||
      message.includes("use cache")
    ) {
      return;
    }
    throw error;
  }
}
