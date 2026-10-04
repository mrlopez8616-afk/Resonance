import { FightIndex } from "@/components/fight-board";
import { OperatorShell } from "@/components/operator-shell";
import { fallbackBetBook } from "@/lib/bets-store-core";
import { loadBetsStore } from "@/lib/bets-store";
import { fallbackFightResults } from "@/lib/fight-results";
import { loadFightResultsStore } from "@/lib/fight-results-store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fights · Resonance 2.0",
};

export default async function FightsPage() {
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
      <FightIndex bets={bets} results={results} />
    </OperatorShell>
  );
}
