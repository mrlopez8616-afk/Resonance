import { notFound, redirect } from "next/navigation";
import { staticFightCard } from "@/data/dwcs-cards";
import { canonicalEventSlug } from "@/lib/fight-event-alias";
import { eventPageHref, eventTimeBucket, legacyFightNodeHref, resolveFightEventPage } from "@/lib/fight-desk";
import { loadBetsForPage, loadCalendarForPage } from "@/lib/store-page";

export const dynamic = "force-dynamic";

/** Old event URLs land on Upcoming or Past. The card itself is unchanged. */
export default async function FightEventRedirect({
  params,
}: {
  params: Promise<{ event: string }>;
}) {
  const { event } = await params;
  const legacy = legacyFightNodeHref(event);
  if (legacy) redirect(legacy);
  const canonical = canonicalEventSlug(event);
  const slug = canonical || event;
  const [book, calendar] = await Promise.all([loadBetsForPage(), loadCalendarForPage()]);
  const bets = book.status === "unavailable" ? [] : book.bets;
  const resolved = resolveFightEventPage(slug, bets, calendar.events);
  if (!resolved && !staticFightCard(slug) && !staticFightCard(event)) notFound();
  redirect(eventPageHref(slug, eventTimeBucket(resolved?.when ?? null)));
}
