import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { FinanceFloor, FinanceWaiting } from "@/components/finance-floor";
import { FitnessGrid } from "@/components/fitness-grid";
import { NodeGrid } from "@/components/node-grid";
import { PositionRollupView } from "@/components/position-book";
import { OperatorShell } from "@/components/operator-shell";
import { PredictionsFloor } from "@/components/predictions-floor";
import { requireRole } from "@/lib/auth-session";
import { loadBankroll } from "@/lib/bankroll-load";
import { loadFinancePage } from "@/lib/finance/store";
import { financeCards } from "@/lib/finance/view";
import { loadFitnessCards } from "@/lib/fitness-store";
import { loadOperatorFloor } from "@/lib/operator-floor";
import { AI_STOCK_TICKERS, retiringHeldLine, retiringHeldTickers } from "@/lib/ai-stocks";
import { holdingChildModel, type ChildCardModel } from "@/lib/child-card";
import { CRYPTO_HOME_TICKERS, nextTickerCatalystLine } from "@/lib/home-lines";
import { legacyParentHref, parentById } from "@/lib/node-parents";
import { yahooSessionDay } from "@/lib/equity-chart";
import { rollupHoldingBooks } from "@/lib/position-lots";
import { loadCryptoCloses, loadCryptoHistory, loadEquityCloses, loadEquityHistory } from "@/lib/price-history";
import { loadOperatorFills } from "@/lib/sleeve-prints";
import { loadCalendarForPage } from "@/lib/store-page";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { valueCardFromFace } from "@/lib/value-card";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ parent: string }>;
}) {
  const { parent: id } = await params;
  const parent = parentById(id);
  return {
    title: parent ? `${parent.label} · Resonance 2.0` : "Floor · Resonance 2.0",
  };
}

export default async function ParentNodePage({
  params,
}: {
  params: Promise<{ parent: string }>;
}) {
  const { parent: id } = await params;
  const legacy = legacyParentHref(id);
  if (legacy) {
    if (id === "predictions") permanentRedirect(legacy);
    redirect(legacy);
  }
  const parent = parentById(id);
  if (!parent) notFound();

  if (parent.id === "fight-desk") {
    const [floor, bankroll] = await Promise.all([loadOperatorFloor(), loadBankroll()]);
    return (
      <OperatorShell
        storageMessage={
          floor.storageMessage ??
          (bankroll.status === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null)
        }
        storageDetail={floor.storageDetail ?? bankroll.storageDetail}
      >
        <PredictionsFloor ledger={bankroll.ledger} />
      </OperatorShell>
    );
  }

  if (parent.id === "finance") {
    await requireRole("owner");
    const finance = await loadFinancePage();
    return (
      <OperatorShell
        storageMessage={finance.status === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null}
      >
        <Link href="/" className="calendar-back">
          Floor
        </Link>
        {finance.status === "live" ? (
          <FinanceFloor
            asOf={finance.snapshot.asOf}
            stale={finance.stale}
            cards={financeCards(finance.snapshot)}
          />
        ) : finance.status === "waiting" ? (
          <FinanceWaiting />
        ) : null}
      </OperatorShell>
    );
  }

  if (parent.id === "fitness") {
    const [floor, fitness] = await Promise.all([loadOperatorFloor(), loadFitnessCards()]);
    return (
      <OperatorShell
        storageMessage={
          floor.storageMessage ??
          (fitness.availability === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null)
        }
        storageDetail={floor.storageDetail}
      >
        <Link href="/" className="calendar-back">
          Floor
        </Link>
        <FitnessGrid cards={fitness.cards} />
      </OperatorShell>
    );
  }

  const childParent = parent.id === "crypto" || parent.id === "ai-stocks";
  const [floor, calendar, history, book, dated] = await Promise.all([
    loadOperatorFloor(),
    childParent ? loadCalendarForPage() : Promise.resolve(null),
    parent.id === "crypto"
      ? loadCryptoHistory(CRYPTO_HOME_TICKERS)
      : parent.id === "ai-stocks"
        ? loadEquityHistory(AI_STOCK_TICKERS)
        : Promise.resolve(null),
    childParent ? loadOperatorFills() : Promise.resolve(null),
    parent.id === "crypto"
      ? loadCryptoCloses(CRYPTO_HOME_TICKERS)
      : parent.id === "ai-stocks"
        ? loadEquityCloses(AI_STOCK_TICKERS)
        : Promise.resolve(null),
  ]);
  const retiring =
    parent.id === "ai-stocks" ? retiringHeldLine(retiringHeldTickers(floor.sleeves)) : null;
  const cards = Object.fromEntries(
    Object.entries(floor.faces).map(([ticker, face]) => [ticker, valueCardFromFace(face)]),
  );
  const heldUsd = Object.fromEntries(
    Object.entries(floor.faces).map(([ticker, face]) => [ticker, face.totalUsd]),
  );
  const now = new Date();
  const events = calendar?.events ?? [];
  const childCards: Record<string, ChildCardModel> = {};
  if (parent.id === "crypto") {
    for (const ticker of CRYPTO_HOME_TICKERS) {
      const face = floor.faces[ticker];
      if (!face) continue;
      const quote = floor.spotQuotes[ticker];
      childCards[ticker] = holdingChildModel({
        face,
        changePct: typeof quote?.change24hPct === "number" ? quote.change24hPct : null,
        fetchedAt: quote?.fetchedAt ?? null,
        now,
        catalyst: nextTickerCatalystLine(events, ticker, now),
        history: history?.[ticker] ?? null,
        treasury: ticker === "XRP",
      });
    }
  } else if (parent.id === "ai-stocks") {
    for (const ticker of AI_STOCK_TICKERS) {
      const face = floor.faces[ticker];
      if (!face) continue;
      const quote = floor.equityQuotes[ticker];
      childCards[ticker] = holdingChildModel({
        face,
        changePct: typeof quote?.change24hPct === "number" ? quote.change24hPct : null,
        fetchedAt: quote?.fetchedAt ?? null,
        now,
        catalyst: nextTickerCatalystLine(events, ticker, now),
        history: history?.[ticker] ?? null,
      });
    }
  }
  return (
    <OperatorShell
      storageMessage={floor.storageMessage}
      storageDetail={floor.storageDetail}
    >
      <Link href="/" className="calendar-back">
        Floor
      </Link>
      {retiring ? <p className="parent-retiring">{retiring}</p> : null}
      <NodeGrid
        parentId={parent.id}
        parentLabel={parent.label}
        cards={cards}
        heldUsd={heldUsd}
        childCards={childParent ? childCards : undefined}
      />
      {childParent && book && dated ? (
        <PositionRollupView
          rollup={rollupHoldingBooks({
            tickers: parent.id === "crypto" ? CRYPTO_HOME_TICKERS : AI_STOCK_TICKERS,
            fills: book.fills,
            sleeves: floor.sleeves,
            prices: Object.fromEntries(
              (parent.id === "crypto" ? CRYPTO_HOME_TICKERS : AI_STOCK_TICKERS).map((ticker) => [
                ticker,
                floor.faces[ticker]?.priceUsd ?? null,
              ]),
            ),
            closes: dated,
            today: yahooSessionDay(Date.now() / 1000) ?? "",
          })}
        />
      ) : null}
    </OperatorShell>
  );
}
