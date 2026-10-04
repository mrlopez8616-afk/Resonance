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
import { loadCalendarForPage } from "@/lib/store-page";

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
  const [{ day }, rawSearch, store, fillsLoaded] = await Promise.all([
    params,
    searchParams,
    loadCalendarForPage(),
    loadOperatorFills(),
  ]);
  if (!isCivilDay(day)) notFound();

  const today = chicagoToday();
  const search = parseCalendarDaySearch(rawSearch);
  const storageMessage = storageBanner([
    store.status === "unconfigured" ? "live" : store.status,
    fillsLoaded.status,
  ]);

  return (
    <OperatorShell
      storageMessage={storageMessage ? STORAGE_UNAVAILABLE_BANNER : null}
      storageDetail={
        [
          store.status === "seed-only" ? "Calendar events are seed-only." : null,
          fillsLoaded.status === "seed-only" ? "Fills are seed-only." : null,
        ]
          .filter((line): line is string => line !== null)
          .join(" ") || null
      }
    >
      <CalendarDayView
        day={day}
        events={store.events}
        fills={fillsLoaded.fills}
        search={search}
        today={today}
        storeLabel={store.storeLabel}
      />
    </OperatorShell>
  );
}
