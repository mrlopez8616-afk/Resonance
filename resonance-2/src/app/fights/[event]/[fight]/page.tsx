import { notFound, redirect } from "next/navigation";
import { FightDetail } from "@/components/fight-board";
import { blockedPublicPage } from "@/components/private-notice";
import { OperatorShell } from "@/components/operator-shell";
import { canonicalEventSlug } from "@/lib/fight-event-alias";
import { resolveFightView } from "@/lib/fight-breakdowns";
import { eventPageHref, eventTimeBucket, resolveFightEventPage } from "@/lib/fight-desk";
import { resultForFight } from "@/lib/fight-results";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import {
  betBookLine,
  loadBetsForPage,
  loadBreakdownsForPage,
  loadCalendarForPage,
  loadFightResultsForPage,
  withStaleDetail,
} from "@/lib/store-page";
import { fightBySlug, UFC_332_EVENT } from "@/lib/ufc332";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ event: string; fight: string }>;
}) {
  const { event, fight: slug } = await params;
  if (event === UFC_332_EVENT.id) {
    const fight = fightBySlug(slug);
    const title = fight ? `${fight.A.name} vs ${fight.B.name}` : "Fight";
    return { title: `${title} · Resonance 2.0` };
  }
  const [book, breakdownPage] = await Promise.all([loadBetsForPage(), loadBreakdownsForPage()]);
  const view = resolveFightView({
    eventSlug: event,
    fightSlug: slug,
    breakdowns: breakdownPage.status === "unavailable" ? [] : breakdownPage.breakdowns,
    bets: book.status === "unavailable" ? [] : book.bets,
  });
  const title = view.status === "ready" ? `${view.fight.A.name} vs ${view.fight.B.name}` : "Fight";
  return { title: `${title} · Resonance 2.0` };
}

function oneQuery(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  return value?.[0] ?? null;
}

export default async function FightPage({
  params,
  searchParams,
}: {
  params: Promise<{ event: string; fight: string }>;
  searchParams: Promise<{ node?: string | string[] }>;
}) {
  const blocked = await blockedPublicPage();
  if (blocked) return blocked;
  const { event, fight: slug } = await params;
  const requestedNode = oneQuery((await searchParams).node);
  const canonical = canonicalEventSlug(event);
  if (canonical && canonical !== event.trim().toLowerCase()) redirect(`/fights/${canonical}/${slug}`);
  if (requestedNode) redirect(`/fights/${event}/${slug}`);
  if (event === UFC_332_EVENT.id) {
    const fight = fightBySlug(slug);
    if (!fight) notFound();
    const [book, card, calendar] = await Promise.all([
      loadBetsForPage(),
      loadFightResultsForPage(),
      loadCalendarForPage(),
    ]);
    const bets = book.status === "unavailable" ? [] : book.bets;
    const results = card.status === "unavailable" ? [] : card.results;
    const availability =
      book.status === "unavailable" ? "unavailable" : book.status === "unconfigured" ? "seed-only" : "live";
    const resultsAvailability =
      card.status === "unavailable" ? "unavailable" : card.status === "unconfigured" ? "seed-only" : "live";
    const storageMessage =
      book.status === "unavailable" || card.status === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null;
    const storageDetail = withStaleDetail(
      [
        await betBookLine(book),
        card.status === "unavailable" ? "Fight results are unavailable." : null,
      ]
        .filter((line): line is string => line !== null)
        .join(" ") || null,
      book,
      card,
      calendar,
    );

    return (
      <OperatorShell storageMessage={storageMessage} storageDetail={storageDetail || null}>
        <FightDetail
          fight={fight}
          bets={bets}
          result={resultForFight(results, fight.slug)}
          backHref={eventPageHref(
            UFC_332_EVENT.id,
            eventTimeBucket(resolveFightEventPage(event, bets, calendar.events)?.when ?? null),
          )}
          availability={availability}
          resultsAvailability={resultsAvailability}
        />
      </OperatorShell>
    );
  }

  const [book, card, breakdownPage, calendar] = await Promise.all([
    loadBetsForPage(),
    loadFightResultsForPage(),
    loadBreakdownsForPage(),
    loadCalendarForPage(),
  ]);
  const bets = book.status === "unavailable" ? [] : book.bets;
  const results = card.status === "unavailable" ? [] : card.results;
  const breakdowns = breakdownPage.status === "unavailable" ? [] : breakdownPage.breakdowns;
  const view = resolveFightView({ eventSlug: event, fightSlug: slug, breakdowns, bets });
  if (view.status !== "ready") notFound();
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
    breakdownPage,
    calendar,
  );

  return (
    <OperatorShell storageMessage={storageMessage} storageDetail={storageDetail || null}>
      <FightDetail
        fight={view.fight}
        bets={view.bets}
        result={resultForFight(results, view.fight.slug, event)}
        backHref={eventPageHref(
          event,
          eventTimeBucket(resolveFightEventPage(event, bets, calendar.events)?.when ?? null),
        )}
        backLabel={view.eventTitle}
        hideEmpty
        availability={availability}
        resultsAvailability={resultsAvailability}
      />
    </OperatorShell>
  );
}
