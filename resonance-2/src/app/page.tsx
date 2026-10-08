import { ParentGrid } from "@/components/parent-grid";
import { OperatorShell } from "@/components/operator-shell";
import { ThisWeek } from "@/components/this-week";
import { getSession } from "@/lib/auth-session";
import { bankrollHomeFace } from "@/lib/bankroll";
import { loadFinancePage } from "@/lib/finance/store";
import { financeHomeForRole, type FinanceHomeFace } from "@/lib/finance/view";
import { loadBankroll } from "@/lib/bankroll-load";
import { loadFitnessHome } from "@/lib/fitness-store";
import { EQUITY_FACE_TICKERS } from "@/lib/live-face";
import { CRYPTO_HOME_TICKERS, nextAiCatalystLine, nextCryptoCatalystLine, type HomeMove } from "@/lib/home-lines";
import { fitnessStepBars, inScopeBankrollPoints, predictionsTierBar } from "@/lib/home-visuals";
import { loadOperatorFloor } from "@/lib/operator-floor";
import { loadBetsForPage, loadCalendarForPage } from "@/lib/store-page";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { fightLinkTargets } from "@/lib/fight-desk";
import { thisWeekItems } from "@/lib/this-week";

export const dynamic = "force-dynamic";

function moveFromQuote(
  ticker: string,
  quote: { change24hPct?: number | null; fetchedAt?: string | null } | null | undefined,
): HomeMove {
  return {
    id: ticker.toLowerCase(),
    ticker,
    changePct: typeof quote?.change24hPct === "number" ? quote.change24hPct : null,
    fetchedAt: quote?.fetchedAt ?? null,
  };
}

export default async function Home() {
  const [floor, fitness, bankroll, calendar, book, session] = await Promise.all([
    loadOperatorFloor(),
    loadFitnessHome(),
    loadBankroll(),
    loadCalendarForPage(),
    loadBetsForPage(),
    getSession(),
  ]);
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
  const moves: HomeMove[] = EQUITY_FACE_TICKERS.map((ticker) =>
    moveFromQuote(ticker, floor.equityQuotes[ticker]),
  );
  const cryptoMoves: HomeMove[] = CRYPTO_HOME_TICKERS.map((ticker) =>
    moveFromQuote(ticker, floor.spotQuotes[ticker]),
  );
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
        moves={moves}
        cryptoMoves={cryptoMoves}
        catalystLine={nextAiCatalystLine(calendar.events, asOf)}
        cryptoCatalystLine={nextCryptoCatalystLine(calendar.events, asOf)}
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
