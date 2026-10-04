import { notFound } from "next/navigation";
import { FightEvent } from "@/components/fight-board";
import { OperatorShell } from "@/components/operator-shell";
import { isPublishedFightEvent } from "@/lib/fight-pages";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { loadBetsForPage } from "@/lib/store-page";
import { UFC_332_EVENT } from "@/lib/ufc332";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ event: string }>;
}) {
  const { event } = await params;
  const title = isPublishedFightEvent(event) ? UFC_332_EVENT.name : "Fights";
  return { title: `${title} · Resonance 2.0` };
}

export default async function FightEventPage({
  params,
}: {
  params: Promise<{ event: string }>;
}) {
  const { event } = await params;
  if (!isPublishedFightEvent(event)) notFound();
  const book = await loadBetsForPage();
  const bets = book.status === "unavailable" ? [] : book.bets;
  const availability =
    book.status === "unavailable" ? "unavailable" : book.status === "unconfigured" ? "seed-only" : "live";
  return (
    <OperatorShell
      storageMessage={book.status === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null}
      storageDetail={book.status === "unavailable" ? "Bet book is unavailable." : null}
    >
      <FightEvent bets={bets} availability={availability} />
    </OperatorShell>
  );
}
