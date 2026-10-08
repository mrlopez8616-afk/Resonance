import "server-only";

import type { FightDeskSummary } from "@/lib/bets";
import { EQUITY_FACE_TICKERS, loadEquityQuotes } from "@/lib/equity-price";
import { assembleLiveFace, type LiveFaceData } from "@/lib/live-face";
import { loadLiveSleeveBooks, type SleeveBooks } from "@/lib/sleeve-prints";
import { loadSpotQuotes } from "@/lib/spot-price";
import { STORAGE_UNAVAILABLE_BANNER, storageBanner } from "@/lib/storage-unavailable";
import { loadFightDeskSummary } from "@/lib/store-page";

export type OperatorFloor = {
  faces: Record<string, LiveFaceData>;
  sleeves: SleeveBooks;
  fightDesk: FightDeskSummary | null;
  fightDeskAvailability: "live" | "seed-only" | "unavailable";
  storageMessage: string | null;
  storageDetail: string | null;
};

/** Same read-only floor load the homepage used before parent drill-down. */
export async function loadOperatorFloor(): Promise<OperatorFloor> {
  const [cryptoQuotes, equityQuotes, sleeves, fightDesk] = await Promise.all([
    loadSpotQuotes(["XRP", "SUI", "HBAR"]),
    loadEquityQuotes(EQUITY_FACE_TICKERS),
    loadLiveSleeveBooks(),
    loadFightDeskSummary(),
  ]);
  const faces = {
    XRP: assembleLiveFace("XRP", sleeves.books.XRP, cryptoQuotes.XRP),
    SUI: assembleLiveFace("SUI", sleeves.books.SUI, cryptoQuotes.SUI),
    PWR: assembleLiveFace("PWR", sleeves.books.PWR, equityQuotes.PWR),
    ETN: assembleLiveFace("ETN", sleeves.books.ETN, equityQuotes.ETN),
    VRT: assembleLiveFace("VRT", sleeves.books.VRT, equityQuotes.VRT),
    GEV: assembleLiveFace("GEV", sleeves.books.GEV, equityQuotes.GEV),
    CEG: assembleLiveFace("CEG", sleeves.books.CEG, equityQuotes.CEG),
    HUBB: assembleLiveFace("HUBB", sleeves.books.HUBB, equityQuotes.HUBB),
    HBAR: assembleLiveFace("HBAR", sleeves.books.HBAR, cryptoQuotes.HBAR),
  };
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
  };
}
