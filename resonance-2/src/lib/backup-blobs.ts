import "server-only";

import { list } from "@vercel/blob";
import { blobUnavailableNote, readLiveBlobs, type BlobBackupRead } from "@/lib/backup";
import { readPrivateBlob } from "@/lib/blob-read";

/**
 * Read the live cabinet. Never put, copy, or delete Blob objects.
 * A suspended store is reported and does not fail the Postgres snapshot.
 */

const READ_LIMIT_MS = 8_000;

async function listLive(prefix: string): Promise<{ pathname: string }[]> {
  const found: { pathname: string }[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const result = await list({ prefix, cursor, limit: 100 });
    for (const blob of result.blobs) {
      if (blob.pathname.startsWith("backups/") || blob.pathname.startsWith("snapshots/")) continue;
      found.push({ pathname: blob.pathname });
    }
    if (!result.hasMore || !result.cursor) break;
    cursor = result.cursor;
  }
  return found;
}

async function readOne(pathname: string) {
  const body = await readPrivateBlob(pathname);
  if (body.status === "ok") return { status: "ok" as const, text: body.text };
  if (body.status === "missing") return { status: "missing" as const };
  return { status: "unavailable" as const, reason: body.reason };
}

export async function readLiveBlobsFromStore(): Promise<BlobBackupRead> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      readLiveBlobs({ list: listLive, read: readOne }),
      new Promise<BlobBackupRead>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Blob read timed out.")), READ_LIMIT_MS);
      }),
    ]);
  } catch (error) {
    return { status: "unavailable", files: [], note: blobUnavailableNote(error) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
