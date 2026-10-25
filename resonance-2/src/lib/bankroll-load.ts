import "server-only";

import { computeBankroll, type BankrollLedger } from "@/lib/bankroll";
import type { StoredBankrollDeposit } from "@/lib/bankroll-deposits";
import { loadBankrollDeposits } from "@/lib/bankroll-deposits-store";
import { loadBetsForPage, loadCalendarForPage, withStaleDetail } from "@/lib/store-page";

export type BankrollPage = {
  status: "live" | "seed-only" | "unavailable";
  ledger: BankrollLedger | null;
  deposits: StoredBankrollDeposit[];
  storageDetail: string | null;
};

/** One read of the bet book, the fight calendar, and deposits. The ledger is not stored. */
export async function loadBankroll(): Promise<BankrollPage> {
  const [book, calendar, deposits] = await Promise.all([
    loadBetsForPage(),
    loadCalendarForPage(),
    loadBankrollDeposits(),
  ]);
  if (book.status === "unavailable") {
    return { status: "unavailable", ledger: null, deposits: [], storageDetail: "Bet book is unavailable." };
  }
  if (deposits.availability === "unavailable") {
    return {
      status: "unavailable",
      ledger: null,
      deposits: [],
      storageDetail: "Bankroll deposits are unavailable.",
    };
  }
  return {
    status: book.status === "unconfigured" ? "seed-only" : "live",
    ledger: computeBankroll(book.bets, calendar.events, deposits.rows),
    deposits: deposits.rows,
    storageDetail: withStaleDetail(
      book.status === "unconfigured" ? "Bet book is seed-only." : null,
      book,
      calendar,
    ),
  };
}
