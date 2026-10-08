import { notFound, redirect } from "next/navigation";
import { FightEvent, ListedFightEvent } from "@/components/fight-board";
import { OperatorShell } from "@/components/operator-shell";
import { applyStaticCard, staticFightCard } from "@/data/dwcs-cards";
import { deskFightsForEvent } from "@/lib/fight-breakdowns";
import { eventBackHref, legacyFightNodeHref, resolveFightEventPage } from "@/lib/fight-desk";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import {
  loadBetsForPage,
  loadBreakdownsForPage,
  loadCalendarForPage,
  loadFightResultsForPage,
} from "@/lib/store-page";

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
  const title = resolved?.title ?? staticFightCard(event)?.title ?? "Fights";
  return { title: `${title} · Resonance 2.0` };
}

function oneQuery(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  return value?.[0] ?? null;
}

export default async function FightEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ event: string }>;
  searchParams: Promise<{ node?: string | string[] }>;
}) {
  const { event } = await params;
  const legacy = legacyFightNodeHref(event);
  if (legacy) redirect(legacy);
  const requestedNode = oneQuery((await searchParams).node);
  if (requestedNode) redirect(`/fights/${event}`);
  const [book, card, calendar, breakdownPage] = await Promise.all([
    loadBetsForPage(),
    loadFightResultsForPage(),
    loadCalendarForPage(),
    loadBreakdownsForPage(),
  ]);
  const bets = book.status === "unavailable" ? [] : book.bets;
  const results = card.status === "unavailable" ? [] : card.results;
  const breakdowns = breakdownPage.status === "unavailable" ? [] : breakdownPage.breakdowns;
  const resolved = resolveFightEventPage(event, bets, calendar.events);
  const listedFights = deskFightsForEvent(
    resolved?.slug ?? event,
    resolved?.kind === "listed" ? resolved.fights : [],
    breakdowns,
  );
  const staticCard = staticFightCard(event);
  const fights = applyStaticCard(event, listedFights);
  if (!resolved && fights.length === 0) notFound();
  const back = eventBackHref(resolved?.slug ?? event, { title: resolved?.title ?? event });
  const availability =
    book.status === "unavailable" ? "unavailable" : book.status === "unconfigured" ? "seed-only" : "live";
  const resultsAvailability =
    card.status === "unavailable" ? "unavailable" : card.status === "unconfigured" ? "seed-only" : "live";
  const storageMessage =
    book.status === "unavailable" ||
    card.status === "unavailable" ||
    breakdownPage.status === "unavailable"
      ? STORAGE_UNAVAILABLE_BANNER
      : null;
  const storageDetail = [
    book.status === "unavailable" ? "Bet book is unavailable." : null,
    card.status === "unavailable" ? "Fight results are unavailable." : null,
    breakdownPage.status === "unavailable" ? "Fight breakdowns are unavailable." : null,
  ]
    .filter((line): line is string => line !== null)
    .join(" ");

  return (
    <OperatorShell storageMessage={storageMessage} storageDetail={storageDetail || null}>
      {resolved?.kind === "ufc-332" ? (
        <FightEvent
          bets={resolved.bets}
          results={results}
          backHref={back.href}
          backLabel={back.label}
          availability={availability}
          resultsAvailability={resultsAvailability}
        />
      ) : (
        <ListedFightEvent
          title={resolved?.kind === "listed" ? resolved.title : staticCard?.title ?? event}
          meta={resolved?.kind === "listed" ? resolved.meta : staticCard?.meta ?? ""}
          fights={fights}
          bets={resolved?.kind === "listed" ? resolved.bets : []}
          results={results}
          eventSlug={event}
          backHref={back.href}
          backLabel={back.label}
          availability={availability}
          resultsAvailability={resultsAvailability}
        />
      )}
    </OperatorShell>
  );
}
