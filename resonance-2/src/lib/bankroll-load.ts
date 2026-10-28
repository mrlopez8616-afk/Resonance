import "server-only";

import { computeBankroll, type BankrollBookFacts, type BankrollLedger } from "@/lib/bankroll";
import type { Bet } from "@/lib/bets";
import type { StoredBankrollDeposit } from "@/lib/bankroll-deposits";
import { loadBankrollDeposits, type DepositRead } from "@/lib/bankroll-deposits-store";
import type { CalendarEvent } from "@/data/calendar";
import {
  loadBetsForPage,
  loadCalendarForPage,
  withStaleDetail,
  type BetsPage,
  type CalendarPage,
} from "@/lib/store-page";

export type { BankrollBookFacts };

export type BankrollPage = {
  status: "live" | "seed-only" | "unavailable";
  ledger: BankrollLedger | null;
  deposits: StoredBankrollDeposit[];
  storageDetail: string | null;
  /** Null only when the bet book itself could not be read. */
  bookFacts: BankrollBookFacts | null;
};

function bookFactsFrom(bets: readonly Bet[], events: readonly CalendarEvent[]): BankrollBookFacts {
  const ledger = computeBankroll(bets, events, []);
  return {
    open: ledger.open,
    deskOpen: ledger.deskOpen,
    atRiskLabel: ledger.atRiskLabel,
    recordLabel: ledger.recordLabel,
  };
}

/**
 * The dollar ledger needs deposits. The record, open count, and at-risk total do not.
 * A failed deposit read leaves the ledger null and keeps the bet-book facts.
 */
export function assembleBankrollPage(
  book: BetsPage,
  calendar: CalendarPage,
  deposits: DepositRead,
): BankrollPage {
  if (book.status === "unavailable") {
    return {
      status: "unavailable",
      ledger: null,
      deposits: [],
      storageDetail: "Bet book is unavailable.",
      bookFacts: null,
    };
  }
  const bookFacts = bookFactsFrom(book.bets, calendar.events);
  if (deposits.availability === "unavailable") {
    return {
      status: "unavailable",
      ledger: null,
      deposits: [],
      storageDetail: "Bankroll deposits are unavailable.",
      bookFacts,
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
      { status: "live", stale: deposits.stale === true },
    ),
    bookFacts,
  };
}

/** One read of the bet book, the fight calendar, and deposits. The ledger is not stored. */
export async function loadBankroll(): Promise<BankrollPage> {
  const [book, calendar, deposits] = await Promise.all([
    loadBetsForPage(),
    loadCalendarForPage(),
    loadBankrollDeposits(),
  ]);
  return assembleBankrollPage(book, calendar, deposits);
}
