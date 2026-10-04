import { notFound } from "next/navigation";
import { FightDetail } from "@/components/fight-board";
import { OperatorShell } from "@/components/operator-shell";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { loadBetsForPage } from "@/lib/store-page";
import { fightBySlug, UFC_332_EVENT } from "@/lib/ufc332";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ event: string; fight: string }>;
}) {
  const { event, fight: slug } = await params;
  const fight = event === UFC_332_EVENT.id ? fightBySlug(slug) : null;
  const title = fight ? `${fight.A.name} vs ${fight.B.name}` : "Fight";
  return { title: `${title} · Resonance 2.0` };
}

export default async function FightPage({
  params,
}: {
  params: Promise<{ event: string; fight: string }>;
}) {
  const { event, fight: slug } = await params;
  if (event !== UFC_332_EVENT.id) notFound();
  const fight = fightBySlug(slug);
  if (!fight) notFound();
  const book = await loadBetsForPage();
  const bets = book.status === "unavailable" ? [] : book.bets;
  const availability =
    book.status === "unavailable" ? "unavailable" : book.status === "unconfigured" ? "seed-only" : "live";
  return (
    <OperatorShell
      storageMessage={book.status === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null}
      storageDetail={book.status === "unavailable" ? "Bet book is unavailable." : null}
    >
      <FightDetail fight={fight} bets={bets} availability={availability} />
    </OperatorShell>
  );
}
