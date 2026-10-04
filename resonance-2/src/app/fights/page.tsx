import { FightIndex } from "@/components/fight-board";
import { OperatorShell } from "@/components/operator-shell";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { loadBetsForPage } from "@/lib/store-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fights · Resonance 2.0",
};

export default async function FightsPage() {
  const book = await loadBetsForPage();
  const bets = book.status === "unavailable" ? [] : book.bets;
  const availability =
    book.status === "unavailable" ? "unavailable" : book.status === "unconfigured" ? "seed-only" : "live";
  return (
    <OperatorShell
      storageMessage={book.status === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null}
      storageDetail={
        book.status === "unavailable"
          ? "Bet book is unavailable."
          : book.status === "unconfigured"
            ? "Bet book is seed-only."
            : null
      }
    >
      <FightIndex bets={bets} availability={availability} />
    </OperatorShell>
  );
}
