import { notFound } from "next/navigation";
import { CalendarDayView } from "@/components/calendar-day-page";
import { OperatorShell } from "@/components/operator-shell";
import {
  parseCalendarDaySearch,
  type CalendarDaySearch,
} from "@/lib/calendar-desk";
import { loadCalendarStore } from "@/lib/calendar-store";
import { chicagoToday, formatCivilDate, isCivilDay } from "@/lib/calendar-time";
import { loadOperatorFills } from "@/lib/sleeve-prints";

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
    loadCalendarStore(),
    loadOperatorFills(),
  ]);
  if (!isCivilDay(day)) notFound();

  const today = chicagoToday();
  const search = parseCalendarDaySearch(rawSearch);
  const storeLabel =
    store.configured && store.backend === "blob"
      ? "durable store"
      : store.configured
        ? "local store"
        : "seed fallback";

  return (
    <OperatorShell>
      <CalendarDayView
        day={day}
        events={store.envelope.events}
        fills={fillsLoaded.fills}
        search={search}
        today={today}
        storeLabel={storeLabel}
      />
    </OperatorShell>
  );
}
