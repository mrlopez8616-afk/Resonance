import { NodeGrid } from "@/components/node-grid";
import { OperatorShell } from "@/components/operator-shell";
import { EQUITY_FACE_TICKERS, loadEquityQuotes } from "@/lib/equity-price";
import { assembleLiveFace } from "@/lib/live-face";
import { loadLiveSleeveBooks } from "@/lib/sleeve-prints";
import { loadSpotQuotes } from "@/lib/spot-price";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [cryptoQuotes, equityQuotes, sleeves] = await Promise.all([
    loadSpotQuotes(["XRP", "SUI"]),
    loadEquityQuotes(EQUITY_FACE_TICKERS),
    loadLiveSleeveBooks(),
  ]);
  const faces = {
    XRP: assembleLiveFace("XRP", sleeves.XRP, cryptoQuotes.XRP),
    SUI: assembleLiveFace("SUI", sleeves.SUI, cryptoQuotes.SUI),
    PWR: assembleLiveFace("PWR", sleeves.PWR, equityQuotes.PWR),
    ETN: assembleLiveFace("ETN", sleeves.ETN, equityQuotes.ETN),
    VRT: assembleLiveFace("VRT", sleeves.VRT, equityQuotes.VRT),
    GEV: assembleLiveFace("GEV", sleeves.GEV, equityQuotes.GEV),
    CEG: assembleLiveFace("CEG", sleeves.CEG, equityQuotes.CEG),
    HUBB: assembleLiveFace("HUBB", sleeves.HUBB, equityQuotes.HUBB),
  };

  return (
    <OperatorShell>
      <NodeGrid faces={faces} sleeves={sleeves} />
    </OperatorShell>
  );
}
