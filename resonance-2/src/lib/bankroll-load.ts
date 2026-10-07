import "server-only";

import { computeBankroll, type BankrollLedger } from "@/lib/bankroll";
import { loadBetsForPage, loadCalendarForPage } from "@/lib/store-page";

export type BankrollPage = {
  status: "live" | "seed-only" | "unavailable";
  ledger: BankrollLedger | null;
  storageDetail: string | null;
};

/** One read of the bet book and the fight calendar. The ledger is not stored. */
export async function loadBankroll(): Promise<BankrollPage> {
  const [book, calendar] = await Promise.all([loadBetsForPage(), loadCalendarForPage()]);
  if (book.status === "unavailable") {
    return { status: "unavailable", ledger: null, storageDetail: "Bet book is unavailable." };
  }
  return {
    status: book.status === "unconfigured" ? "seed-only" : "live",
    ledger: computeBankroll(book.bets, calendar.events),
    storageDetail: book.status === "unconfigured" ? "Bet book is seed-only." : null,
  };
}
