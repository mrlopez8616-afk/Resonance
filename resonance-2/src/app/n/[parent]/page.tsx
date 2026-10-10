import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { XrpTriggerCard } from "@/components/xrp-trigger-floor";
import { FinanceFloor, FinanceWaiting } from "@/components/finance-floor";
import { FitnessGrid } from "@/components/fitness-grid";
import { CatalystEntry } from "@/components/catalyst-calendar";
import { NodeGrid } from "@/components/node-grid";
import { PositionRollupView } from "@/components/position-book";
import { PublicFightRecord, PublicGroupFloor } from "@/components/public-floor";
import { PrivatePage } from "@/components/private-notice";
import { OperatorShell } from "@/components/operator-shell";
import { PredictionsFloor } from "@/components/predictions-floor";
import { requireRole } from "@/lib/auth-session";
import { loadBankroll } from "@/lib/bankroll-load";
import { loadPublicFloor } from "@/lib/public-load";
import { publicRecordLabel, scrubTextFields } from "@/lib/public-mode";
import { loadFinancePage } from "@/lib/finance/store";
import { financeCards } from "@/lib/finance/view";
import { loadFitnessCards } from "@/lib/fitness-store";
import { loadOperatorFloor } from "@/lib/operator-floor";
import { AI_STOCK_TICKERS, retiringHeldLine, retiringHeldTickers } from "@/lib/ai-stocks";
import { holdingChildModel, type ChildCardModel } from "@/lib/child-card";
import { CRYPTO_HOME_TICKERS, nextTickerCatalystLine } from "@/lib/home-lines";
import { barsFromOpenLots, type LotBarModel } from "@/lib/lot-bars";
import { legacyParentHref, parentById } from "@/lib/node-parents";
import { yahooSessionDay } from "@/lib/equity-chart";
import { assembleNodePosition, displayLotBooks, rollupHoldingBooks, type DailyClose, type LedgerFill } from "@/lib/position-lots";
import { isPublicMode } from "@/lib/public-mode-server";
import { loadCryptoCloses, loadEquityCloses, loadXrpTriggerCloses } from "@/lib/price-history";
import { evaluateXrpTrigger } from "@/lib/xrp-trigger";
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

  if (await isPublicMode()) {
    if (parent.id === "finance") return <PrivatePage />;
    if (parent.id === "fight-desk") {
      const bankroll = await loadBankroll();
      return (
        <OperatorShell
          storageMessage={bankroll.status === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null}
          storageDetail={bankroll.storageDetail}
        >
          <Link href="/" className="calendar-back">
            Floor
          </Link>
          <PublicFightRecord record={publicRecordLabel(bankroll.ledger?.recordLabel)} />
        </OperatorShell>
      );
    }
    if (parent.id === "crypto" || parent.id === "ai-stocks") {
      const [floor, calendar, triggerCloses] = await Promise.all([
        loadPublicFloor(),
        parent.id === "ai-stocks" ? loadCalendarForPage() : Promise.resolve(null),
        parent.id === "crypto" ? loadXrpTriggerCloses() : Promise.resolve(null),
      ]);
      const group = parent.id === "crypto" ? floor.model.crypto : floor.model.aiStocks;
      const trigger =
        parent.id === "crypto" ? (
          <XrpTriggerCard view={evaluateXrpTrigger(triggerCloses ?? [], new Date())} publicMode />
        ) : null;
      return (
        <OperatorShell storageMessage={floor.storageMessage} storageDetail={floor.storageDetail}>
          <Link href="/" className="calendar-back">
            Floor
          </Link>
          {calendar ? (
            <CatalystEntry events={calendar.events.map((event) => scrubTextFields(event))} now={new Date()} />
          ) : null}
          <PublicGroupFloor
            group={group}
            bars={floor.groupBars[parent.id]}
            cardBars={floor.nodeBars}
            treasury={parent.id === "crypto"}
            extra={trigger}
          />
        </OperatorShell>
      );
    }
  }

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
  const [floor, calendar, book, dated, triggerCloses] = await Promise.all([
    loadOperatorFloor(),
    childParent ? loadCalendarForPage() : Promise.resolve(null),
    childParent ? loadOperatorFills() : Promise.resolve(null),
    parent.id === "crypto"
      ? loadCryptoCloses(CRYPTO_HOME_TICKERS)
      : parent.id === "ai-stocks"
        ? loadEquityCloses(AI_STOCK_TICKERS)
        : Promise.resolve(null),
    parent.id === "crypto" ? loadXrpTriggerCloses() : Promise.resolve(null),
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
      });
    }
  }
  const lotTickers = parent.id === "crypto" ? CRYPTO_HOME_TICKERS : parent.id === "ai-stocks" ? AI_STOCK_TICKERS : [];
  const today = yahooSessionDay(Date.now() / 1000) ?? "";
  const lotBars: Record<string, LotBarModel | null> = {};
  if (book && dated) {
    for (const ticker of lotTickers) {
      lotBars[ticker] = compactCardLots(
        ticker,
        book.fills,
        floor.sleeves[ticker as keyof typeof floor.sleeves],
        floor.faces[ticker]?.priceUsd ?? null,
        dated[ticker] ?? [],
        today,
      );
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
      {parent.id === "ai-stocks" ? <CatalystEntry events={events} now={now} /> : null}
      <NodeGrid
        parentId={parent.id}
        parentLabel={parent.label}
        cards={cards}
        heldUsd={heldUsd}
        childCards={childParent ? childCards : undefined}
        lotBars={childParent ? lotBars : undefined}
        extra={
          parent.id === "crypto" ? (
            <XrpTriggerCard view={evaluateXrpTrigger(triggerCloses ?? [], now)} publicMode={false} />
          ) : null
        }
      />
      {childParent && book && dated ? (
        <PositionRollupView
          parentId={parent.id}
          publicMode={await isPublicMode()}
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
            today,
          })}
        />
      ) : null}
    </OperatorShell>
  );
}

/** One bar per open lot with a real entry and P/L. Unknown entry stays off the card. */
function compactCardLots(
  ticker: string,
  fills: readonly LedgerFill[],
  sleeves: readonly { id: string; quantity: string }[] | undefined,
  priceUsd: number | null,
  closes: readonly DailyClose[] | null,
  today: string,
): LotBarModel | null {
  const position = assembleNodePosition({
    fills,
    ticker,
    sleeves,
    priceUsd,
    closes: closes ?? [],
    today,
  });
  if (!position) return null;
  const listed = displayLotBooks(position.books, position.agenticLines.length > 0);
  const books = listed.length > 0 ? listed : [{ ledger: position.ledger }];
  const bars = barsFromOpenLots(
    books.flatMap((book) =>
      book.ledger.openLots.map((lot) => ({
        time: lot.time,
        day: lot.day,
        remainingQty: lot.remainingQty,
        originalQty: lot.originalQty,
        price: lot.price,
        entryUsd: lot.entryUsd,
        valueUsd: lot.valueUsd,
        pnlUsd: lot.pnlUsd,
        pnlPct: lot.pnlPct,
      })),
    ),
    false,
  );
  return bars.length > 0 ? { bars, caption: null } : null;
}
