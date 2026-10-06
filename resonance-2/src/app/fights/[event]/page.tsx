import { notFound } from "next/navigation";
import { FightEvent, ListedFightEvent } from "@/components/fight-board";
import { OperatorShell } from "@/components/operator-shell";
import { resolveFightEventPage } from "@/lib/fight-desk";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { loadBetsForPage, loadCalendarForPage, loadFightResultsForPage } from "@/lib/store-page";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ event: string }>;
}) {
  const { event } = await params;
  const [book, calendar] = await Promise.all([loadBetsForPage(), loadCalendarForPage()]);
  const bets = book.status === "unavailable" ? [] : book.bets;
  const resolved = resolveFightEventPage(event, bets, calendar.events);
  const title = resolved?.title ?? "Fights";
  return { title: `${title} · Resonance 2.0` };
}

export default async function FightEventPage({
  params,
}: {
  params: Promise<{ event: string }>;
}) {
  const { event } = await params;
  const [book, card, calendar] = await Promise.all([
    loadBetsForPage(),
    loadFightResultsForPage(),
    loadCalendarForPage(),
  ]);
  const bets = book.status === "unavailable" ? [] : book.bets;
  const results = card.status === "unavailable" ? [] : card.results;
  const resolved = resolveFightEventPage(event, bets, calendar.events);
  if (!resolved) notFound();
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
      {resolved.kind === "ufc-332" ? (
        <FightEvent
          bets={resolved.bets}
          results={results}
          availability={availability}
          resultsAvailability={resultsAvailability}
        />
      ) : (
        <ListedFightEvent
          title={resolved.title}
          meta={resolved.meta}
          fights={resolved.fights}
          bets={resolved.bets}
          results={results}
          availability={availability}
          resultsAvailability={resultsAvailability}
        />
      )}
    </OperatorShell>
  );
}
