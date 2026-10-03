import { notFound } from "next/navigation";
import { FightEvent } from "@/components/fight-board";
import { OperatorShell } from "@/components/operator-shell";
import { betSeed } from "@/lib/bets";
import { loadBetsStore } from "@/lib/bets-store";
import { isPublishedFightEvent } from "@/lib/fight-pages";
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
  const bets = await loadBetsStore()
    .then((loaded) => loaded.envelope.bets)
    .catch(() => betSeed());
  return (
    <OperatorShell>
      <FightEvent bets={bets} />
    </OperatorShell>
  );
}
