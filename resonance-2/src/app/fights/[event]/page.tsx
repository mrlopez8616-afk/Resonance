import { notFound, redirect } from "next/navigation";
import { blockedPublicPage } from "@/components/private-notice";
import { staticFightCard } from "@/data/dwcs-cards";
import { eventPageHref, eventTimeBucket, legacyFightNodeHref, resolveFightEventPage } from "@/lib/fight-desk";
import { loadBetsForPage, loadCalendarForPage } from "@/lib/store-page";

export const dynamic = "force-dynamic";

/** Old event URLs land on Upcoming or Past. The card itself is unchanged. */
export default async function FightEventRedirect({
  params,
}: {
  params: Promise<{ event: string }>;
}) {
  const blocked = await blockedPublicPage();
  if (blocked) return blocked;
  const { event } = await params;
  const legacy = legacyFightNodeHref(event);
  if (legacy) redirect(legacy);
  const [book, calendar] = await Promise.all([loadBetsForPage(), loadCalendarForPage()]);
  const bets = book.status === "unavailable" ? [] : book.bets;
  const resolved = resolveFightEventPage(event, bets, calendar.events);
  if (!resolved && !staticFightCard(event)) notFound();
  redirect(eventPageHref(event, eventTimeBucket(resolved?.when ?? null)));
}
