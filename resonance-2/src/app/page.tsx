import { NodeGrid } from "@/components/node-grid";
import { OperatorShell } from "@/components/operator-shell";
import { assembleLiveFace } from "@/lib/live-face";
import { loadLiveSleeveBooks } from "@/lib/sleeve-prints";
import { loadSpotQuotes } from "@/lib/spot-price";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [quotes, sleeves] = await Promise.all([
    loadSpotQuotes(["XRP", "SUI"]),
    loadLiveSleeveBooks(),
  ]);
  const faces = {
    XRP: assembleLiveFace("XRP", sleeves.XRP, quotes.XRP),
    SUI: assembleLiveFace("SUI", sleeves.SUI, quotes.SUI),
  };

  return (
    <OperatorShell>
      <NodeGrid faces={faces} sleeves={sleeves} />
    </OperatorShell>
  );
}
