import { NextResponse } from "next/server";
import type { BackupRunResult } from "@/lib/backup";
import { BackupConfigError, runNightlyBackup } from "@/lib/backup-run";
import {
  authorizeBackupAccess,
  getCronSecret,
  getSyncSecret,
  readBearerToken,
} from "@/lib/sync-auth-core";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/** Counts and status only. No snapshot body and no store URL. */
export function backupResponse(result: BackupRunResult) {
  return {
    ok: result.ok,
    status: result.status,
    day: result.startedAt.slice(0, 10),
    prefix: result.prefix,
    tables: result.tableCounts,
    byteSize: result.byteSize,
    objectCount: result.objectCount,
    blobStatus: result.blobStatus,
    pruned: result.pruned,
    error: result.error,
  };
}

async function handle(request: Request) {
  const auth = authorizeBackupAccess({
    cronSecret: getCronSecret(),
    syncSecret: getSyncSecret(),
    bearer: readBearerToken(request.headers.get("authorization")),
  });
  if (!auth.ok) return json({ ok: false, error: auth.error }, 401);
  if (!process.env.DATABASE_URL?.trim()) {
    return json({ ok: false, error: "Postgres is not configured." }, 503);
  }
  try {
    const result = await runNightlyBackup();
    return json(backupResponse(result), result.ok ? 200 : 500);
  } catch (error) {
    if (error instanceof BackupConfigError) return json({ ok: false, error: error.message }, 503);
    console.error("nightly backup failed");
    return json({ ok: false, error: "Backup failed." }, 500);
  }
}

/** Vercel Cron calls GET once a day. */
export async function GET(request: Request) {
  return handle(request);
}

/** Manual run with the same Bearer. */
export async function POST(request: Request) {
  return handle(request);
}
