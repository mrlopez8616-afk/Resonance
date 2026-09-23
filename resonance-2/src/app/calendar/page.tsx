import { CalendarDesk } from "@/components/calendar-desk";
import { OperatorShell } from "@/components/operator-shell";
import {
  parseCalendarDeskQuery,
  type CalendarDeskSearch,
} from "@/lib/calendar-desk";
import { loadCalendarStore } from "@/lib/calendar-store";
import { chicagoToday } from "@/lib/calendar-time";

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
  const [params, store] = await Promise.all([searchParams, loadCalendarStore()]);
  const query = parseCalendarDeskQuery(params, today);
  const storeLabel =
    store.configured && store.backend === "blob"
      ? "durable store"
      : store.configured
        ? "local store"
        : "seed fallback";

  return (
    <OperatorShell>
      <CalendarDesk
        events={store.envelope.events}
        query={query}
        today={today}
        storeLabel={storeLabel}
      />
    </OperatorShell>
  );
}
