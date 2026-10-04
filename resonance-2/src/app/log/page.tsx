import { FillDesk } from "@/components/fill-desk";
import { OperatorShell } from "@/components/operator-shell";
import { betToFill } from "@/lib/bets";
import { fallbackBetBook } from "@/lib/bets-store-core";
import { loadBetsStore } from "@/lib/bets-store";
import { parseFillDeskQuery, type FillDeskSearch } from "@/lib/fill-desk";
import { listFills } from "@/lib/fills";
import { loadLiveSleeveBooks, loadOperatorFills } from "@/lib/sleeve-prints";

export const dynamic = "force-dynamic";

export default async function OperatorLogPage({
  searchParams,
}: {
  searchParams: Promise<FillDeskSearch>;
}) {
  const query = parseFillDeskQuery(await searchParams);
  const [{ fills, backend, configured }, sleeves, bets] = await Promise.all([
    loadOperatorFills(),
    loadLiveSleeveBooks(),
    loadBetsStore()
      .then((loaded) => loaded.envelope.bets)
      .catch(() => fallbackBetBook()),
  ]);
  const rows = listFills([...fills, ...bets.map(betToFill)]);
  const storeLabel =
    configured && backend === "blob"
      ? "durable store"
      : configured
        ? "local store"
        : "seed fallback";

  return (
    <OperatorShell>
      <FillDesk
        fills={rows}
        sleeves={sleeves}
        query={query}
        storeLabel={storeLabel}
        bets={bets}
      />
    </OperatorShell>
  );
}
