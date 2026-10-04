import { NodeGrid } from "@/components/node-grid";
import { OperatorShell } from "@/components/operator-shell";
import { summarizeBets } from "@/lib/bets";
import { fallbackBetBook } from "@/lib/bets-store-core";
import { loadBetsStore } from "@/lib/bets-store";
import { EQUITY_FACE_TICKERS, loadEquityQuotes } from "@/lib/equity-price";
import { assembleLiveFace } from "@/lib/live-face";
import { loadLiveSleeveBooks } from "@/lib/sleeve-prints";
import { loadSpotQuotes } from "@/lib/spot-price";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [cryptoQuotes, equityQuotes, sleeves, fightDesk] = await Promise.all([
    loadSpotQuotes(["XRP", "SUI", "HBAR"]),
    loadEquityQuotes(EQUITY_FACE_TICKERS),
    loadLiveSleeveBooks(),
    loadBetsStore()
      .then((loaded) => summarizeBets(loaded.envelope.bets))
      .catch(() => summarizeBets(fallbackBetBook())),
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
    HBAR: assembleLiveFace("HBAR", sleeves.HBAR, cryptoQuotes.HBAR),
  };

  return (
    <OperatorShell>
      <NodeGrid faces={faces} sleeves={sleeves} fightDesk={fightDesk} />
    </OperatorShell>
  );
}
