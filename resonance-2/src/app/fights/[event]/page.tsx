import { notFound } from "next/navigation";
import { FightEvent } from "@/components/fight-board";
import { OperatorShell } from "@/components/operator-shell";
import { isPublishedFightEvent } from "@/lib/fight-pages";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { loadBetsForPage, loadFightResultsForPage } from "@/lib/store-page";
import { UFC_332_EVENT } from "@/lib/ufc332";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ event: string }>;
}) {
  const { event } = await params;
  const title = isPublishedFightEvent(event) ? UFC_332_EVENT.name : "Fights";
  return { title: `${title} · Resonance 2.0` };
}

export default async function FightEventPage({
  params,
}: {
  params: Promise<{ event: string }>;
}) {
  const { event } = await params;
  if (!isPublishedFightEvent(event)) notFound();
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
    book.status === "unavailable" ? "Bet book is unavailable." : null,
    card.status === "unavailable" ? "Fight results are unavailable." : null,
  ]
    .filter((line): line is string => line !== null)
    .join(" ");

  return (
    <OperatorShell storageMessage={storageMessage} storageDetail={storageDetail || null}>
      <FightEvent
        bets={bets}
        results={results}
        availability={availability}
        resultsAvailability={resultsAvailability}
      />
    </OperatorShell>
  );
}
