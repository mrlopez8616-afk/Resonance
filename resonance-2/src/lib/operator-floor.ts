import "server-only";

import type { FightDeskSummary } from "@/lib/bets";
import { sleevesForEquityCard } from "@/lib/ai-stocks";
import { EQUITY_FACE_TICKERS, loadEquityQuotes } from "@/lib/equity-price";
import { assembleLiveFace, type LiveFaceData, type SpotQuote } from "@/lib/live-face";
import { loadLiveSleeveBooks, type SleeveBooks } from "@/lib/sleeve-prints";
import { readBrokerSyncView } from "@/lib/broker-sync-store";
import type { BrokerSyncView } from "@/lib/broker-sync";
import { robinhoodEquityMark } from "@/lib/broker-sync";
import type { SuiBalanceMark } from "@/lib/sui-balance-line";
import { loadSpotQuotes, readSharedSpotQuotes, type SpotTicker } from "@/lib/spot-price";
import { STORAGE_UNAVAILABLE_BANNER, storageBanner } from "@/lib/storage-unavailable";
import { loadFightDeskSummary } from "@/lib/store-page";

export type OperatorFloor = {
  faces: Record<string, LiveFaceData>;
  sleeves: SleeveBooks;
  fightDesk: FightDeskSummary | null;
  fightDeskAvailability: "live" | "seed-only" | "unavailable";
  storageMessage: string | null;
  storageDetail: string | null;
  /** Quotes the floor already fetched. Home lines read these. They are not a second feed. */
  spotQuotes: Record<SpotTicker, SpotQuote | null>;
  equityQuotes: Record<(typeof EQUITY_FACE_TICKERS)[number], SpotQuote | null>;
  /** SUI Coinbase read. Fresh is a portfolio breakdown from this load. */
  suiBalance: SuiBalanceMark;
  /** Scheduled Coinbase and Robinhood reads. Cash stays off the public lines. */
  brokerSync: BrokerSyncView;
};

/** Same read-only floor load the homepage used before parent drill-down. */
export async function loadOperatorFloor(options?: { quotes?: "live" | "cache" }): Promise<OperatorFloor> {
  const shareQuotes = options?.quotes === "cache";
  const now = new Date();
  const [cryptoQuotes, equityQuotes, sleeves, fightDesk, brokerSync] = await Promise.all([
    shareQuotes ? readSharedSpotQuotes(["XRP", "SUI"]) : loadSpotQuotes(["XRP", "SUI"]),
    loadEquityQuotes(EQUITY_FACE_TICKERS),
    loadLiveSleeveBooks(),
    loadFightDeskSummary(),
    readBrokerSyncView(now).catch(() => ({
      coinbase: { status: "error" as const, syncedAt: null, stale: true, line: "Coinbase · stale", cashLine: null, orders: 0 },
      robinhood: { status: "error" as const, syncedAt: null, stale: true, line: "Robinhood · stale", cashLine: null, orders: 0 },
      equity: robinhoodEquityMark(now),
    })),
  ]);
  const faces: Record<string, LiveFaceData> = {
    XRP: assembleLiveFace("XRP", sleeves.books.XRP, cryptoQuotes.XRP),
    SUI: assembleLiveFace("SUI", sleeves.books.SUI, cryptoQuotes.SUI),
  };
  for (const ticker of EQUITY_FACE_TICKERS) {
    faces[ticker] = assembleLiveFace(
      ticker,
      sleevesForEquityCard(sleeves.books[ticker]),
      equityQuotes[ticker],
    );
  }
  const storageMessage = storageBanner([
    sleeves.status,
    fightDesk.status === "unavailable" ? "unavailable" : "live",
  ]);
  const details = [
    sleeves.status === "seed-only" ? "Sleeve quantities are seed-only." : null,
    fightDesk.status === "unavailable" ? "Bet book is unavailable." : null,
    fightDesk.status === "seed-only" ? "Bet book is seed-only." : null,
  ].filter((line): line is string => line !== null);
  const fightStale = fightDesk.status === "live" && fightDesk.stale === true;

  return {
    faces,
    sleeves: sleeves.books,
    fightDesk: fightDesk.summary,
    fightDeskAvailability:
      fightDesk.status === "unavailable" ? "unavailable" : fightDesk.status,
    storageMessage: storageMessage ? STORAGE_UNAVAILABLE_BANNER : null,
    storageDetail: storageMessage
      ? details.length
        ? details.join(" ")
        : null
      : fightStale
        ? "stale"
        : details.length
          ? details.join(" ")
          : null,
    spotQuotes: cryptoQuotes,
    equityQuotes,
    suiBalance: sleeves.suiBalance,
    brokerSync,
  };
}
