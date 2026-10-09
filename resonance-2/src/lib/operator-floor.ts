import "server-only";

import type { FightDeskSummary } from "@/lib/bets";
import { sleevesForEquityCard } from "@/lib/ai-stocks";
import { EQUITY_FACE_TICKERS, loadEquityQuotes } from "@/lib/equity-price";
import { assembleLiveFace, type LiveFaceData, type SpotQuote } from "@/lib/live-face";
import { loadLiveSleeveBooks, type SleeveBooks } from "@/lib/sleeve-prints";
import { loadSpotQuotes, type SpotTicker } from "@/lib/spot-price";
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
};

/** Same read-only floor load the homepage used before parent drill-down. */
export async function loadOperatorFloor(): Promise<OperatorFloor> {
  const [cryptoQuotes, equityQuotes, sleeves, fightDesk] = await Promise.all([
    loadSpotQuotes(["XRP", "SUI"]),
    loadEquityQuotes(EQUITY_FACE_TICKERS),
    loadLiveSleeveBooks(),
    loadFightDeskSummary(),
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

  return {
    faces,
    sleeves: sleeves.books,
    fightDesk: fightDesk.summary,
    fightDeskAvailability:
      fightDesk.status === "unavailable" ? "unavailable" : fightDesk.status,
    storageMessage: storageMessage ? STORAGE_UNAVAILABLE_BANNER : null,
    storageDetail: details.length ? details.join(" ") : null,
    spotQuotes: cryptoQuotes,
    equityQuotes,
  };
}
