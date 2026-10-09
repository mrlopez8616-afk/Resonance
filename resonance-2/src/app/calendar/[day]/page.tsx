import { notFound } from "next/navigation";
import { CalendarDayView } from "@/components/calendar-day-page";
import { OperatorShell } from "@/components/operator-shell";
import {
  parseCalendarDaySearch,
  type CalendarDaySearch,
} from "@/lib/calendar-desk";
import { chicagoToday, formatCivilDate, isCivilDay } from "@/lib/calendar-time";
import { loadOperatorFills } from "@/lib/sleeve-prints";
import { STORAGE_UNAVAILABLE_BANNER, storageBanner } from "@/lib/storage-unavailable";
import { fightLinkTargets } from "@/lib/fight-desk";
import { scrubTextFields } from "@/lib/public-mode";
import { isPublicMode } from "@/lib/public-mode-server";
import { loadBetsForPage, loadCalendarForPage } from "@/lib/store-page";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ day: string }>;
}) {
  const { day } = await params;
  const title = isCivilDay(day) ? formatCivilDate(day) : "Day";
  return { title: `${title} · Calendar · Resonance 2.0` };
}

export default async function CalendarDayRoute({
  params,
  searchParams,
}: {
  params: Promise<{ day: string }>;
  searchParams: Promise<CalendarDaySearch>;
}) {
  const pub = await isPublicMode();
  const [{ day }, rawSearch, store, fillsLoaded, book] = await Promise.all([
    params,
    searchParams,
    loadCalendarForPage(),
    pub ? Promise.resolve(null) : loadOperatorFills(),
    pub ? Promise.resolve(null) : loadBetsForPage(),
  ]);
  if (!isCivilDay(day)) notFound();

  const today = chicagoToday();
  const search = parseCalendarDaySearch(rawSearch);
  const events = pub ? store.events.map((event) => scrubTextFields(event)) : store.events;
  const storageMessage = storageBanner([
    store.status === "unconfigured" ? "live" : store.status,
    pub ? "live" : (fillsLoaded?.status ?? "live"),
  ]);

  return (
    <OperatorShell
      storageMessage={storageMessage ? STORAGE_UNAVAILABLE_BANNER : null}
      storageDetail={
        [
          store.status === "seed-only" ? "Calendar events are seed-only." : null,
          !pub && fillsLoaded?.status === "seed-only" ? "Fills are seed-only." : null,
        ]
          .filter((line): line is string => line !== null)
          .join(" ") || null
      }
    >
      <CalendarDayView
        day={day}
        events={events}
        fills={pub || !fillsLoaded ? [] : fillsLoaded.fills}
        search={search}
        today={today}
        storeLabel={store.storeLabel}
        fightTargets={
          pub || !book
            ? []
            : fightLinkTargets(book.status === "unavailable" ? [] : book.bets, events)
        }
        hideFills={pub}
      />
    </OperatorShell>
  );
}
