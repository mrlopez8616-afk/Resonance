import { NextResponse } from "next/server";
import { isBetSettleOverride, parseBetPostBody, parseSettleBody } from "@/lib/bets";
import { asBetWriteError, isBetsStoreConfigured, postStoredBets, settleStoredBets } from "@/lib/bets-store";
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

function writtenJson(written: {
  backend: string;
  results: { deduped: boolean; bet: unknown }[];
  envelope: { updatedAt: string };
}) {
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
}

/**
 * Append Coinbase Predict bets. Auth is the same Bearer as POST /api/bets/settle.
 * Re-posting an orderId already in the store is a no-op unless override is true.
 * A settle-shaped body with override: true corrects an already-settled row
 * (status, payout, stake). Without the flag the stored row is left alone.
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
    if (isBetSettleOverride(body)) {
      const written = await settleStoredBets(parseSettleBody(body));
      return writtenJson(written);
    }
    const written = await postStoredBets(parseBetPostBody(body));
    return writtenJson(written);
  } catch (error) {
    const mapped = asBetWriteError(error);
    console.error("bet post failed", mapped.message);
    return NextResponse.json(storageErrorJson(mapped), { status: mapped.status });
  }
}
