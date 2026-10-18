import { NextResponse } from "next/server";
import { computeBankroll } from "@/lib/bankroll";
import { loadBankrollDeposits } from "@/lib/bankroll-deposits-store";
import { loadBetsForPage, loadCalendarForPage } from "@/lib/store-page";
import { authorizeSyncRequest } from "@/lib/sync-auth";

export const dynamic = "force-dynamic";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** Bankroll ledger plus every stored deposit. Sync Bearer, same as POST /api/bets. */
export async function GET(request: Request) {
  const auth = authorizeSyncRequest(request);
  if (!auth.ok) return json(401, { ok: false, error: auth.error });
  if (!process.env.DATABASE_URL?.trim()) {
    return json(503, { ok: false, configured: false, error: "Postgres is not configured." });
  }
  const [book, calendar, deposits] = await Promise.all([
    loadBetsForPage(),
    loadCalendarForPage(),
    loadBankrollDeposits(),
  ]);
  if (book.status === "unavailable") {
    return json(503, { ok: false, error: "Bet book is unavailable." });
  }
  if (deposits.availability !== "live") {
    return json(503, { ok: false, error: "Bankroll deposits are unavailable." });
  }
  const ledger = computeBankroll(book.bets, calendar.events, deposits.rows);
  return json(200, { ok: true, configured: true, ...ledger, deposits: deposits.rows });
}
