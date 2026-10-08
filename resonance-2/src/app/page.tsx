import { ParentGrid } from "@/components/parent-grid";
import { OperatorShell } from "@/components/operator-shell";
import { bankrollHomeFace } from "@/lib/bankroll";
import { loadBankroll } from "@/lib/bankroll-load";
import { loadFitnessHome } from "@/lib/fitness-store";
import { loadOperatorFloor } from "@/lib/operator-floor";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [floor, fitness, bankroll] = await Promise.all([
    loadOperatorFloor(),
    loadFitnessHome(),
    loadBankroll(),
  ]);
  const faceTotals = Object.fromEntries(
    Object.entries(floor.faces).map(([ticker, face]) => [ticker, face.totalUsd]),
  );
  const storageMessage =
    floor.storageMessage ??
    (fitness.availability === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null);

  return (
    <OperatorShell storageMessage={storageMessage} storageDetail={floor.storageDetail}>
      <ParentGrid
        faceTotals={faceTotals}
        fightDesk={floor.fightDesk}
        fightDeskAvailability={floor.fightDeskAvailability}
        fitnessLine={fitness.line}
        bankroll={bankroll.ledger ? bankrollHomeFace(bankroll.ledger) : null}
      />
    </OperatorShell>
  );
}
