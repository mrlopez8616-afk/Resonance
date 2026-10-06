import { NextResponse } from "next/server";
import { readPrivateBlob } from "@/lib/blob-read";
import { importBlobDocuments, ImportError } from "@/lib/pg/import-blob";
import { authorizeSyncRequest } from "@/lib/sync-auth";
import { isStorageUnavailable, storageErrorJson } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

function unauthorized(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 401 });
}

/**
 * One-time Blob → Postgres import. Same Bearer as POST /api/bets.
 * `?dryRun=1` counts rows and does not write them. Safe to call again.
 */
export async function POST(request: Request) {
  const auth = authorizeSyncRequest(request);
  if (!auth.ok) return unauthorized(auth.error);
  if (!process.env.DATABASE_URL?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Postgres is not configured. Connect Neon on resonance3 so DATABASE_URL is set, then redeploy.",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  let dryRun = url.searchParams.get("dryRun") === "1" || url.searchParams.get("dry-run") === "1";
  const text = await request.text();
  if (text.trim()) {
    try {
      const body = JSON.parse(text) as { dryRun?: unknown };
      if (body.dryRun === true) dryRun = true;
    } catch {
      return NextResponse.json({ ok: false, error: "JSON body is invalid." }, { status: 400 });
    }
  }

  try {
    const report = await importBlobDocuments({ dryRun, read: readPrivateBlob });
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    if (error instanceof ImportError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    if (isStorageUnavailable(error)) {
      return NextResponse.json(storageErrorJson({ message: error.message, reason: error.reason }), {
        status: 503,
      });
    }
    const message = error instanceof Error ? error.message : "Import failed.";
    console.error("blob import failed", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
