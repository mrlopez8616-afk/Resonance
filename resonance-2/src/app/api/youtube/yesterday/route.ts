import { NextResponse } from "next/server";
import { loadYesterdayNumbers } from "@/lib/youtube-analytics-store";
import { authorizeSyncRequest } from "@/lib/sync-auth";
import { isStorageUnavailable, storageErrorJson } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

const PRIVATE = { "cache-control": "no-store" };

/**
 * Yesterday in America/Chicago.
 * `Authorization: Bearer $RESONANCE_SYNC_SECRET`.
 */
export async function GET(request: Request) {
  const auth = authorizeSyncRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401, headers: PRIVATE });
  }
  if (!process.env.DATABASE_URL?.trim()) {
    return NextResponse.json({ ok: false, error: "Postgres is not configured." }, { status: 503, headers: PRIVATE });
  }
  try {
    const body = await loadYesterdayNumbers();
    return NextResponse.json(body, { headers: PRIVATE });
  } catch (error) {
    if (isStorageUnavailable(error)) {
      return NextResponse.json(storageErrorJson(error), { status: 503, headers: PRIVATE });
    }
    console.error("youtube yesterday failed");
    return NextResponse.json({ ok: false, error: "YouTube numbers are unavailable." }, { status: 500, headers: PRIVATE });
  }
}
