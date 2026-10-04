import { FillDesk } from "@/components/fill-desk";
import { OperatorShell } from "@/components/operator-shell";
import { betToFill } from "@/lib/bets";
import { parseFillDeskQuery, type FillDeskSearch } from "@/lib/fill-desk";
import { listFills } from "@/lib/fills";
import { loadLiveSleeveBooks, loadOperatorFills } from "@/lib/sleeve-prints";
import { STORAGE_UNAVAILABLE_BANNER, storageBanner } from "@/lib/storage-unavailable";
import { loadBetsForPage, storeLabel } from "@/lib/store-page";

export const dynamic = "force-dynamic";

export default async function OperatorLogPage({
  searchParams,
}: {
  searchParams: Promise<FillDeskSearch>;
}) {
  const query = parseFillDeskQuery(await searchParams);
  const [fillsLoaded, sleeves, betsLoaded] = await Promise.all([
    loadOperatorFills(),
    loadLiveSleeveBooks(),
    loadBetsForPage(),
  ]);
  const bets = betsLoaded.status === "unavailable" ? [] : betsLoaded.bets;
  const betsAvailability =
    betsLoaded.status === "unavailable"
      ? "unavailable"
      : betsLoaded.status === "unconfigured"
        ? "seed-only"
        : "live";
  const rows = listFills([...fillsLoaded.fills, ...bets.map(betToFill)]);
  const fillStatus = fillsLoaded.status === "live" ? "live" : fillsLoaded.status;
  const storeLabelText = storeLabel(
    fillStatus,
    fillsLoaded.status === "live" ? fillsLoaded.backend : undefined,
  );
  const storageMessage = storageBanner([
    fillsLoaded.status,
    sleeves.status,
    betsLoaded.status === "unavailable" ? "unavailable" : "live",
  ]);
  const details = [
    fillsLoaded.status === "seed-only" || sleeves.status === "seed-only"
      ? "Sleeve fills are seed-only."
      : null,
    betsLoaded.status === "unavailable" ? "Bet book is unavailable." : null,
    betsLoaded.status === "unconfigured" ? "Bet book is seed-only." : null,
  ].filter((line): line is string => line !== null);

  return (
    <OperatorShell
      storageMessage={storageMessage ? STORAGE_UNAVAILABLE_BANNER : null}
      storageDetail={details.length ? details.join(" ") : null}
    >
      <FillDesk
        fills={rows}
        sleeves={sleeves.books}
        query={query}
        storeLabel={storeLabelText}
        bets={bets}
        betsAvailability={betsAvailability}
      />
    </OperatorShell>
  );
}
