import Link from "next/link";
import { CatalystWeekCards } from "@/components/catalyst-calendar";
import { OperatorShell } from "@/components/operator-shell";
import { loadCatalystPage } from "@/lib/catalyst-page";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Catalysts · AI Stocks · Resonance 2.0",
};

export default async function CatalystCalendarPage() {
  const { events, store } = await loadCatalystPage();
  return (
    <OperatorShell storageMessage={store.status === "seed-only" ? STORAGE_UNAVAILABLE_BANNER : null}>
      <Link href="/n/ai-stocks" className="calendar-back">
        AI Stocks
      </Link>
      <CatalystWeekCards events={events} now={new Date()} />
    </OperatorShell>
  );
}
