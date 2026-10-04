import { NextResponse } from "next/server";
import { parseSettleBody } from "@/lib/bets";
import { asBetWriteError, isBetsStoreConfigured, settleStoredBets } from "@/lib/bets-store";
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
    const requests = parseSettleBody(body);
    const written = await settleStoredBets(requests);
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
    console.error("bet settle failed", mapped.message);
    return NextResponse.json(storageErrorJson(mapped), { status: mapped.status });
  }
}
