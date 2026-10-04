import { notFound } from "next/navigation";
import { FightDetail } from "@/components/fight-board";
import { OperatorShell } from "@/components/operator-shell";
import { fallbackBetBook } from "@/lib/bets-store-core";
import { loadBetsStore } from "@/lib/bets-store";
import { fallbackFightResults, resultForFight } from "@/lib/fight-results";
import { loadFightResultsStore } from "@/lib/fight-results-store";
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
      <FightDetail fight={fight} bets={bets} result={resultForFight(results, fight.slug)} />
    </OperatorShell>
  );
}
