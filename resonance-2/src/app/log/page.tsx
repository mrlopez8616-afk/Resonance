import { FillDesk } from "@/components/fill-desk";
import { OperatorShell } from "@/components/operator-shell";
import { parseFillDeskQuery, type FillDeskSearch } from "@/lib/fill-desk";
import { loadLiveSleeveBooks, loadOperatorFills } from "@/lib/sleeve-prints";

export const dynamic = "force-dynamic";

export default async function OperatorLogPage({
  searchParams,
}: {
  searchParams: Promise<FillDeskSearch>;
}) {
  const query = parseFillDeskQuery(await searchParams);
  const [{ fills, backend, configured }, sleeves] = await Promise.all([
    loadOperatorFills(),
    loadLiveSleeveBooks(),
  ]);
  const storeLabel =
    configured && backend === "blob"
      ? "durable store"
      : configured
        ? "local store"
        : "seed fallback";

  return (
    <OperatorShell>
      <FillDesk
        fills={fills}
        sleeves={sleeves}
        query={query}
        storeLabel={storeLabel}
      />
    </OperatorShell>
  );
}
