import { ParentGrid } from "@/components/parent-grid";
import { OperatorShell } from "@/components/operator-shell";
import { ThisWeek } from "@/components/this-week";
import { NODE_PARENT } from "@/data/node-parents";
import { getSession } from "@/lib/auth-session";
import { bankrollHomeFace } from "@/lib/bankroll";
import { loadFinancePage } from "@/lib/finance/store";
import { financeHomeForRole, type FinanceHomeFace } from "@/lib/finance/view";
import { loadBankroll } from "@/lib/bankroll-load";
import { heldCryptoQuantities, type CryptoBasketLeg } from "@/lib/crypto-basket";
import { loadFitnessHome } from "@/lib/fitness-store";
import { EQUITY_FACE_TICKERS } from "@/lib/live-face";
import { nextAiCatalystLine, type HomeMove, type HomeQuote } from "@/lib/home-lines";
import { fitnessStepBars, inScopeBankrollPoints, predictionsTierBar } from "@/lib/home-visuals";
import { loadCryptoBasketCloses } from "@/lib/xrp-history";
import { loadOperatorFloor } from "@/lib/operator-floor";
import { loadBetsForPage, loadCalendarForPage } from "@/lib/store-page";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { fightLinkTargets } from "@/lib/fight-desk";
import { thisWeekItems } from "@/lib/this-week";

export const dynamic = "force-dynamic";

function quoteSlice(
  quote: { usd: number; change24hPct?: number | null; fetchedAt: string } | null,
): HomeQuote | null {
  if (!quote) return null;
  return {
    usd: quote.usd,
    change24hPct: typeof quote.change24hPct === "number" ? quote.change24hPct : null,
    fetchedAt: quote.fetchedAt,
  };
}

export default async function Home() {
  const [floor, fitness, bankroll, calendar, book, closesByTicker, session] = await Promise.all([
    loadOperatorFloor(),
    loadFitnessHome(),
    loadBankroll(),
    loadCalendarForPage(),
    loadBetsForPage(),
    loadCryptoBasketCloses(),
    getSession(),
  ]);
  const basketLegs: CryptoBasketLeg[] = heldCryptoQuantities(
    Object.entries(NODE_PARENT).flatMap(([id, parentId]) => {
      if (parentId !== "crypto") return [];
      const face = floor.faces[id.toUpperCase()];
      if (!face) return [];
      return [
        {
          id,
          ticker: face.ticker,
          quantity: face.totalUnits,
          totalUsd: face.totalUsd,
        },
      ];
    }),
  ).map((leg) => ({
    id: leg.id,
    quantity: leg.quantity,
    closes: closesByTicker[leg.ticker] ?? [],
  }));
  let financeHome: FinanceHomeFace | null = null;
  if (session?.role === "owner") {
    const finance = await loadFinancePage();
    financeHome = financeHomeForRole(
      session.role,
      finance.status === "live" ? finance.snapshot : null,
    );
  }
  const faceTotals = Object.fromEntries(
    Object.entries(floor.faces).map(([ticker, face]) => [ticker, face.totalUsd]),
  );
  const storageMessage =
    floor.storageMessage ??
    (fitness.availability === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null);
  const asOf = new Date();
  const bets = book.status === "unavailable" ? [] : book.bets;
  const moves: HomeMove[] = EQUITY_FACE_TICKERS.map((ticker) => {
    const quote = floor.equityQuotes[ticker];
    return {
      id: ticker.toLowerCase(),
      ticker,
      changePct: typeof quote?.change24hPct === "number" ? quote.change24hPct : null,
      fetchedAt: quote?.fetchedAt ?? null,
    };
  });
  const ledger = bankroll.ledger;

  return (
    <OperatorShell storageMessage={storageMessage} storageDetail={floor.storageDetail}>
      <ThisWeek items={thisWeekItems(calendar.events, asOf, fightLinkTargets(bets, calendar.events))} />
      <ParentGrid
        faceTotals={faceTotals}
        fightDesk={floor.fightDesk}
        fightDeskAvailability={floor.fightDeskAvailability}
        fitnessLine={fitness.line}
        fitnessWeek={fitness.week}
        bankroll={ledger ? bankrollHomeFace(ledger) : null}
        predictions={
          ledger
            ? {
                atRisk: ledger.atRisk,
                atRiskLabel: ledger.atRiskLabel,
                open: ledger.open,
                recordLabel: ledger.recordLabel,
              }
            : null
        }
        xrpQuote={quoteSlice(floor.spotQuotes.XRP)}
        moves={moves}
        catalystLine={nextAiCatalystLine(calendar.events, asOf)}
        basketLegs={basketLegs}
        stepSlots={fitnessStepBars(fitness.stepDays)}
        tierBar={
          ledger
            ? predictionsTierBar(ledger.tiers.map((tier) => ({ id: tier.id, atRiskLabel: tier.atRiskLabel })))
            : null
        }
        bankrollLine={inScopeBankrollPoints(bets, calendar.events)}
        financeHome={financeHome}
        asOf={asOf.toISOString()}
      />
    </OperatorShell>
  );
}
