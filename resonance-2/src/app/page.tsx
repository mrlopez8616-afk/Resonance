import { NodeGrid } from "@/components/node-grid";
import { OperatorShell } from "@/components/operator-shell";
import { SUI_SLEEVES } from "@/data/sui-sleeves";
import { XRP_SLEEVES } from "@/data/xrp-sleeves";
import { assembleLiveFace } from "@/lib/live-face";
import { loadSpotQuotes } from "@/lib/spot-price";

export const dynamic = "force-dynamic";

export default async function Home() {
  const quotes = await loadSpotQuotes(["XRP", "SUI"]);
  const faces = {
    XRP: assembleLiveFace("XRP", XRP_SLEEVES, quotes.XRP),
    SUI: assembleLiveFace("SUI", SUI_SLEEVES, quotes.SUI),
  };

  return (
    <OperatorShell>
      <NodeGrid faces={faces} />
    </OperatorShell>
  );
}
