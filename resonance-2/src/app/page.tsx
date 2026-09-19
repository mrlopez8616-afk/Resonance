import { NodeGrid } from "@/components/node-grid";
import { OperatorShell } from "@/components/operator-shell";
import { loadEquityQuotes } from "@/lib/equity-price";
import { assembleLiveFace } from "@/lib/live-face";
import { loadLiveSleeveBooks } from "@/lib/sleeve-prints";
import { loadSpotQuotes } from "@/lib/spot-price";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [cryptoQuotes, equityQuotes, sleeves] = await Promise.all([
    loadSpotQuotes(["XRP", "SUI"]),
    loadEquityQuotes(["PWR"]),
    loadLiveSleeveBooks(),
  ]);
  const faces = {
    XRP: assembleLiveFace("XRP", sleeves.XRP, cryptoQuotes.XRP),
    SUI: assembleLiveFace("SUI", sleeves.SUI, cryptoQuotes.SUI),
    PWR: assembleLiveFace("PWR", sleeves.PWR, equityQuotes.PWR),
  };

  return (
    <OperatorShell>
      <NodeGrid faces={faces} sleeves={sleeves} />
    </OperatorShell>
  );
}
