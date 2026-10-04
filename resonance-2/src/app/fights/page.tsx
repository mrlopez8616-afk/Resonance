import { FightIndex } from "@/components/fight-board";
import { OperatorShell } from "@/components/operator-shell";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { loadBetsForPage, loadFightResultsForPage } from "@/lib/store-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fights · Resonance 2.0",
};

export default async function FightsPage() {
  const [book, card] = await Promise.all([loadBetsForPage(), loadFightResultsForPage()]);
  const bets = book.status === "unavailable" ? [] : book.bets;
  const results = card.status === "unavailable" ? [] : card.results;
  const availability =
    book.status === "unavailable" ? "unavailable" : book.status === "unconfigured" ? "seed-only" : "live";
  const resultsAvailability =
    card.status === "unavailable" ? "unavailable" : card.status === "unconfigured" ? "seed-only" : "live";
  const storageMessage =
    book.status === "unavailable" || card.status === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null;
  const storageDetail = [
    book.status === "unavailable"
      ? "Bet book is unavailable."
      : book.status === "unconfigured"
        ? "Bet book is seed-only."
        : null,
    card.status === "unavailable"
      ? "Fight results are unavailable."
      : card.status === "unconfigured"
        ? "Fight results are seed-only."
        : null,
  ]
    .filter((line): line is string => line !== null)
    .join(" ");

  return (
    <OperatorShell storageMessage={storageMessage} storageDetail={storageDetail || null}>
      <FightIndex
        bets={bets}
        results={results}
        availability={availability}
        resultsAvailability={resultsAvailability}
      />
    </OperatorShell>
  );
}
