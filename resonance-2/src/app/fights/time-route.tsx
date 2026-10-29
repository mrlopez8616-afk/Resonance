import { FightTimeList } from "@/components/fight-board";
import { OperatorShell } from "@/components/operator-shell";
import { isPublicMode } from "@/lib/public-mode-server";
import { fightTimeBoards, type FightTimeBucket } from "@/lib/fight-desk";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { betBookLine, loadBetsForPage, loadCalendarForPage, withStaleDetail } from "@/lib/store-page";

export async function FightTimeScreen({ bucket }: { bucket: FightTimeBucket }) {
  const publicMode = await isPublicMode();
  const [book, calendar] = await Promise.all([loadBetsForPage(), loadCalendarForPage()]);
  const bets = book.status === "unavailable" ? [] : book.bets;
  const boards = fightTimeBoards({ bets, events: calendar.events });
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
  );

  return (
    <OperatorShell storageMessage={storageMessage} storageDetail={storageDetail}>
      <FightTimeList bucket={bucket} events={boards[bucket]} publicMode={publicMode} />
    </OperatorShell>
  );
}
