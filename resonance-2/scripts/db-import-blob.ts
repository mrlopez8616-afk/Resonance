/**
 * Copy resonance-2/bets.json, fills.json, and calendar.json from the private
 * Blob store into Postgres. Idempotent. Refuses to run when Blob is suspended.
 *
 *   DATABASE_URL=postgres://... npm run db:import-blob -- --dry-run
 *   DATABASE_URL=postgres://... npm run db:import-blob
 */
import { get } from "@vercel/blob";
import { importBlobDocuments, type BlobReadResult } from "../src/lib/pg/import-blob";
import {
  blobFailureReason,
  isBlobMissingError,
  isStorageUnavailable,
  StorageUnavailableError,
  throwIfStorageForced,
} from "../src/lib/storage-unavailable";

function flag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

async function readBlob(pathname: string): Promise<BlobReadResult> {
  try {
    throwIfStorageForced(pathname);
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result?.stream) return { status: "missing" };
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

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is not set. Connect Neon, run db:migrate, then db:import-blob.");
    process.exit(1);
  }
  try {
    const report = await importBlobDocuments({
      dryRun: flag(argv, "--dry-run"),
      read: readBlob,
    });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const reason = isStorageUnavailable(error)
      ? error.reason
      : error instanceof Error
        ? error.message
        : "import failed";
    console.error(reason);
    process.exit(1);
  }
}

void main();
