import { FightIndex } from "@/components/fight-board";
import { OperatorShell } from "@/components/operator-shell";
import { betSeed } from "@/lib/bets";
import { loadBetsStore } from "@/lib/bets-store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fights · Resonance 2.0",
};

export default async function FightsPage() {
  const bets = await loadBetsStore()
    .then((loaded) => loaded.envelope.bets)
    .catch(() => betSeed());
  return (
    <OperatorShell>
      <FightIndex bets={bets} />
    </OperatorShell>
  );
}
