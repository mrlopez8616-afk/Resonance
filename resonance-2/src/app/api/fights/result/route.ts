import { NextResponse } from "next/server";
import { parseFightResultBody } from "@/lib/fight-results";
import {
  asFightResultWriteError,
  isFightResultsStoreConfigured,
  recordFightResults,
} from "@/lib/fight-results-store";
import { storageErrorJson } from "@/lib/storage-unavailable";
import { authorizeSyncRequest } from "@/lib/sync-auth";

export const dynamic = "force-dynamic";

function unauthorized(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 401 });
}

function notConfigured() {
  return NextResponse.json(
    {
      ok: false,
      configured: false,
      error:
        "Fight result store is not configured. In Vercel: Storage → Blob → connect resonance3 → redeploy.",
    },
    { status: 503 },
  );
}

/**
 * Records a bout result. Does not settle bets.
 * The hub posts settlements separately to POST /api/bets/settle.
 */
export async function POST(request: Request) {
  const auth = authorizeSyncRequest(request);
  if (!auth.ok) return unauthorized(auth.error);
  if (!isFightResultsStoreConfigured()) return notConfigured();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON body is required." }, { status: 400 });
  }

  try {
    const incoming = parseFightResultBody(body);
    const written = await recordFightResults(incoming);
    return NextResponse.json({
      ok: true,
      configured: true,
      backend: written.backend,
      deduped: written.results.every((row) => row.deduped),
      results: written.results,
      updatedAt: written.envelope.updatedAt,
    });
  } catch (error) {
    const mapped = asFightResultWriteError(error);
    console.error("fight result failed", mapped.message);
    return NextResponse.json(storageErrorJson(mapped), { status: mapped.status });
  }
}
