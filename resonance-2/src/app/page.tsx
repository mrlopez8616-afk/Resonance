import { ParentGrid } from "@/components/parent-grid";
import { OperatorShell } from "@/components/operator-shell";
import { loadOperatorFloor } from "@/lib/operator-floor";

export const dynamic = "force-dynamic";

export default async function Home() {
  const floor = await loadOperatorFloor();
  const faceTotals = Object.fromEntries(
    Object.entries(floor.faces).map(([ticker, face]) => [ticker, face.totalUsd]),
  );

  return (
    <OperatorShell
      storageMessage={floor.storageMessage}
      storageDetail={floor.storageDetail}
    >
      <ParentGrid
        faceTotals={faceTotals}
        fightDesk={floor.fightDesk}
        fightDeskAvailability={floor.fightDeskAvailability}
      />
    </OperatorShell>
  );
}
