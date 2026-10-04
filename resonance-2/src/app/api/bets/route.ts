import { NextResponse } from "next/server";
import { parseBetPostBody } from "@/lib/bets";
import { asBetWriteError, isBetsStoreConfigured, postStoredBets } from "@/lib/bets-store";
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
        "Bet store is not configured. In Vercel: Storage → Blob → connect resonance3 → redeploy.",
    },
    { status: 503 },
  );
}

/**
 * Append Coinbase Predict bets. Auth is the same Bearer as POST /api/bets/settle.
 * Re-posting an orderId already in the store is a no-op. The stored row is
 * returned and is not rewritten, including after a later settlement.
 */
export async function POST(request: Request) {
  const auth = authorizeSyncRequest(request);
  if (!auth.ok) return unauthorized(auth.error);
  if (!isBetsStoreConfigured()) return notConfigured();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON body is required." }, { status: 400 });
  }

  try {
    const requests = parseBetPostBody(body);
    const written = await postStoredBets(requests);
    const first = written.results[0];
    return NextResponse.json({
      ok: true,
      configured: true,
      backend: written.backend,
      deduped: written.results.every((row) => row.deduped),
      bet: first?.bet,
      results: written.results,
      updatedAt: written.envelope.updatedAt,
    });
  } catch (error) {
    const mapped = asBetWriteError(error);
    console.error("bet post failed", mapped.message);
    return NextResponse.json(storageErrorJson(mapped), { status: mapped.status });
  }
}
