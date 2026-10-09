import "server-only";

import { EQUITY_FACE_TICKERS, loadEquityQuotes } from "@/lib/equity-price";
import {
  moodHoldingsFromBooks,
  portfolioMood,
  unknownPortfolioMood,
  type PortfolioMood,
} from "@/lib/portfolio-mood";
import { loadLiveSleeveBooks } from "@/lib/sleeve-prints";
import { loadSpotQuotes } from "@/lib/spot-price";

/**
 * Mood for the live floor books. Uses the same sleeve loader and spot/equity
 * quotes the node faces use. Fight Desk bets are not part of either feed.
 */
export async function loadPortfolioMood(): Promise<PortfolioMood> {
  try {
    const [crypto, equity, sleeves] = await Promise.all([
      loadSpotQuotes(["XRP", "SUI"]),
      loadEquityQuotes(EQUITY_FACE_TICKERS),
      loadLiveSleeveBooks(),
    ]);
    if (sleeves.status !== "live") return unknownPortfolioMood();
    return portfolioMood(
      moodHoldingsFromBooks(sleeves.books, { ...crypto, ...equity }),
    );
  } catch {
    return unknownPortfolioMood();
  }
}
