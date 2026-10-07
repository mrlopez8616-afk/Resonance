import { CalendarDesk } from "@/components/calendar-desk";
import { OperatorShell } from "@/components/operator-shell";
import {
  parseCalendarDeskQuery,
  type CalendarDeskSearch,
} from "@/lib/calendar-desk";
import { chicagoToday } from "@/lib/calendar-time";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { fightLinkTargets } from "@/lib/fight-desk";
import { loadBetsForPage, loadCalendarForPage } from "@/lib/store-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Calendar · Resonance 2.0",
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<CalendarDeskSearch>;
}) {
  const today = chicagoToday();
  const [params, store, book] = await Promise.all([
    searchParams,
    loadCalendarForPage(),
    loadBetsForPage(),
  ]);
  const query = parseCalendarDeskQuery(params, today);
  const bets = book.status === "unavailable" ? [] : book.bets;

  return (
    <OperatorShell
      storageMessage={store.status === "seed-only" ? STORAGE_UNAVAILABLE_BANNER : null}
      storageDetail={store.status === "seed-only" ? "Calendar events are seed-only." : null}
    >
      <CalendarDesk
        events={store.events}
        query={query}
        today={today}
        storeLabel={store.storeLabel}
        fightTargets={fightLinkTargets(bets, store.events)}
      />
    </OperatorShell>
  );
}
