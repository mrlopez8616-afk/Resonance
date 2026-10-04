import { notFound } from "next/navigation";
import { FightEvent } from "@/components/fight-board";
import { OperatorShell } from "@/components/operator-shell";
import { fallbackBetBook } from "@/lib/bets-store-core";
import { loadBetsStore } from "@/lib/bets-store";
import { isPublishedFightEvent } from "@/lib/fight-pages";
import { fallbackFightResults } from "@/lib/fight-results";
import { loadFightResultsStore } from "@/lib/fight-results-store";
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
  const [bets, results] = await Promise.all([
    loadBetsStore()
      .then((loaded) => loaded.envelope.bets)
      .catch(() => fallbackBetBook()),
    loadFightResultsStore()
      .then((loaded) => loaded.envelope.results)
      .catch(() => fallbackFightResults()),
  ]);
  return (
    <OperatorShell>
      <FightEvent bets={bets} results={results} />
    </OperatorShell>
  );
}
