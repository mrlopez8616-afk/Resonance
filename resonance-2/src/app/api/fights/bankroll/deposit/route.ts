import { NextResponse } from "next/server";
import { BankrollDepositError, parseBankrollDeposit } from "@/lib/bankroll-deposits";
import { postBankrollDeposit } from "@/lib/bankroll-deposits-store";
import { authorizeSyncRequest } from "@/lib/sync-auth";
import { isStorageUnavailable, storageErrorJson } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

/**
 * One deposit. Sync Bearer, same as POST /api/bets.
 * The same id returns the stored row and does not add it again.
 * A negative amount is a withdrawal.
 */
export async function POST(request: Request) {
  const auth = authorizeSyncRequest(request);
  if (!auth.ok) return json(401, { ok: false, error: auth.error });
  if (!process.env.DATABASE_URL?.trim()) {
    return json(503, { ok: false, configured: false, error: "Postgres is not configured." });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "JSON body is required." });
  }
  try {
    const written = await postBankrollDeposit(parseBankrollDeposit(body));
    return json(200, { ok: true, deduped: written.deduped, deposit: written.deposit });
  } catch (error) {
    if (error instanceof BankrollDepositError) {
      return json(error.status, { ok: false, error: error.message });
    }
    if (isStorageUnavailable(error)) {
      return NextResponse.json(storageErrorJson(error), {
        status: 503,
        headers: { "cache-control": "no-store" },
      });
    }
    console.error("bankroll deposit post failed", error instanceof Error ? error.message : "unknown");
    return json(500, { ok: false, error: "Bankroll deposit is unavailable." });
  }
}
