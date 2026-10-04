/**
 * Shown when a configured store cannot be read (suspended blob, 403, 5xx).
 * A missing blob on first run is not this error — that path still seeds.
 */
export const STORAGE_UNAVAILABLE_BANNER =
  "Storage unavailable: live data can't be read right now";

export type StoreAvailability = "live" | "seed-only" | "unconfigured" | "unavailable";

export class StorageUnavailableError extends Error {
  readonly store: string;
  readonly reason: string;

  constructor(store: string, reason: string) {
    super(STORAGE_UNAVAILABLE_BANNER);
    this.name = "StorageUnavailableError";
    this.store = store;
    this.reason = reason;
  }
}

export function isStorageUnavailable(error: unknown): error is StorageUnavailableError {
  return error instanceof StorageUnavailableError;
}

/** Dev-only switch so the floor can be screenshotted without a suspended store. */
export function forcedStorageOutage(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.RESONANCE_STORAGE_UNAVAILABLE === "1") {
    return "Blob store returned 403. This store has been suspended.";
  }
  return null;
}

export function throwIfStorageForced(store: string): void {
  const reason = forcedStorageOutage();
  if (reason) throw new StorageUnavailableError(store, reason);
}

export function blobFailureReason(error: unknown): string {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : "Blob read failed.";
  const status = /Failed to fetch blob:\s*(\d+)/.exec(message);
  if (status) return `Blob store returned ${status[1]}. ${message}`;
  if (/suspended/i.test(message)) return `Blob store returned 403. ${message}`;
  return message;
}

export function isBlobMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name: unknown }).name) : "";
  if (name === "BlobNotFoundError") return true;
  const message = error instanceof Error ? error.message : "";
  if (/store does not exist/i.test(message)) return false;
  return /requested blob does not exist/i.test(message);
}

export function storageErrorJson(mapped: { message: string; reason?: string }): {
  ok: false;
  error: string;
  reason?: string;
} {
  return {
    ok: false,
    error: mapped.message,
    ...(mapped.reason ? { reason: mapped.reason } : {}),
  };
}

export function storageBanner(statuses: readonly StoreAvailability[]): string | null {
  return statuses.some((status) => status === "unavailable" || status === "seed-only")
    ? STORAGE_UNAVAILABLE_BANNER
    : null;
}
