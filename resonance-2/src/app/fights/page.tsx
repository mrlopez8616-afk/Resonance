import { FightIndex } from "@/components/fight-board";
import { blockedPublicPage } from "@/components/private-notice";
import { OperatorShell } from "@/components/operator-shell";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import {
  betBookLine,
  loadBetsForPage,
  loadBreakdownsForPage,
  loadCalendarForPage,
  withStaleDetail,
} from "@/lib/store-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fights · Resonance 2.0",
};

export default async function FightsPage() {
  const blocked = await blockedPublicPage();
  if (blocked) return blocked;
  const [book, calendar, breakdowns] = await Promise.all([
    loadBetsForPage(),
    loadCalendarForPage(),
    loadBreakdownsForPage(),
  ]);
  const bets = book.status === "unavailable" ? [] : book.bets;
  const availability =
    book.status === "unavailable" ? "unavailable" : book.status === "unconfigured" ? "seed-only" : "live";
  const storageMessage = book.status === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null;
  const storageDetail = withStaleDetail(
    book.status === "unavailable"
      ? await betBookLine(book)
      : book.status === "unconfigured"
        ? "Bet book is seed-only."
        : null,
    book,
    calendar,
    breakdowns,
  );

  return (
    <OperatorShell storageMessage={storageMessage} storageDetail={storageDetail}>
      <FightIndex
        bets={bets}
        events={calendar.events}
        availability={availability}
        breakdowns={breakdowns.status === "unavailable" ? [] : breakdowns.breakdowns}
        breakdownStore={
          breakdowns.status === "unavailable"
            ? "unavailable"
            : breakdowns.status === "unconfigured"
              ? "seed-only"
              : "live"
        }
      />
    </OperatorShell>
  );
}
