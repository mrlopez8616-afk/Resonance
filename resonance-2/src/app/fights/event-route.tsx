import { notFound, redirect } from "next/navigation";
import { FightEvent, ListedFightEvent } from "@/components/fight-board";
import { blockedPublicPage } from "@/components/private-notice";
import { OperatorShell } from "@/components/operator-shell";
import { applyStaticCard, staticFightCard } from "@/data/dwcs-cards";
import { deskFightsForEvent } from "@/lib/fight-breakdowns";
import {
  eventBackHref,
  eventPageHref,
  eventTimeBucket,
  legacyFightNodeHref,
  resolveFightEventPage,
  type FightTimeBucket,
} from "@/lib/fight-desk";
import { canonicalEventSlug } from "@/lib/fight-event-alias";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import {
  betBookLine,
  loadBetsForPage,
  loadBreakdownsForPage,
  loadCalendarForPage,
  loadFightResultsForPage,
  withStaleDetail,
} from "@/lib/store-page";

export async function fightEventMetadata(event: string) {
  const [book, calendar] = await Promise.all([loadBetsForPage(), loadCalendarForPage()]);
  const bets = book.status === "unavailable" ? [] : book.bets;
  const resolved = resolveFightEventPage(event, bets, calendar.events);
  const title = resolved?.title ?? staticFightCard(event)?.title ?? "Fights";
  return { title: `${title} · Resonance 2.0` };
}

export async function FightEventScreen({
  event,
  bucket,
}: {
  event: string;
  bucket: FightTimeBucket;
}) {
  const blocked = await blockedPublicPage();
  if (blocked) return blocked;
  const legacy = legacyFightNodeHref(event);
  if (legacy) redirect(legacy);
  const canonical = canonicalEventSlug(event);
  if (canonical && canonical !== event.trim().toLowerCase()) redirect(eventPageHref(canonical, bucket));
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
  const when = resolved?.when ?? null;
  const actual = eventTimeBucket(when);
  if (actual !== bucket) redirect(eventPageHref(event, actual));
  const back = eventBackHref(resolved?.slug ?? event, { title: resolved?.title ?? event, when });
  const past = bucket === "past";
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
  const storageDetail = withStaleDetail(
    [
      await betBookLine(book),
      card.status === "unavailable" ? "Fight results are unavailable." : null,
      breakdownPage.status === "unavailable" ? "Fight breakdowns are unavailable." : null,
    ]
      .filter((line): line is string => line !== null)
      .join(" ") || null,
    book,
    card,
    calendar,
    breakdownPage,
  );

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
          past={past}
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
          past={past}
        />
      )}
    </OperatorShell>
  );
}
