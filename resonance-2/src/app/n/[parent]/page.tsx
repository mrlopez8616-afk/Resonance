import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { XrpTriggerCard } from "@/components/xrp-trigger-floor";
import { FinanceFloor, FinanceWaiting } from "@/components/finance-floor";
import { FitnessStoryView } from "@/components/fitness-story";
import { FitnessTokenCopy } from "@/components/fitness-token-copy";
import { CatalystEntry } from "@/components/catalyst-calendar";
import { NodeGrid } from "@/components/node-grid";
import { ParentGlance } from "@/components/parent-glance";
import { PositionRollupView } from "@/components/position-book";
import { PublicFightRecord, PublicGroupFloor } from "@/components/public-floor";
import { PrivatePage } from "@/components/private-notice";
import { OperatorShell } from "@/components/operator-shell";
import { PredictionsFloor } from "@/components/predictions-floor";
import { requireRole } from "@/lib/auth-session";
import { loadBankroll } from "@/lib/bankroll-load";
import { loadPublicFloor } from "@/lib/public-load";
import { hasMoneyText, publicRecordLabel, scrubTextFields } from "@/lib/public-mode";
import { loadFinancePage } from "@/lib/finance/store";
import { financeCards } from "@/lib/finance/view";
import { loadFitnessManual } from "@/lib/fitness-manual-store";
import { buildFitnessStory, parseStoryRange } from "@/lib/fitness-story";
import { loadFitnessBundle } from "@/lib/fitness-store";
import { nrcRunsAsWrites } from "@/lib/fitness-nrc";
import { shortcutWorkoutsAsWrites } from "@/lib/fitness-workouts";
import { loadOperatorFloor } from "@/lib/operator-floor";
import { AI_STOCK_TICKERS, retiringHeldLine, retiringHeldTickers } from "@/lib/ai-stocks";
import { holdingChildModel, type ChildCardModel } from "@/lib/child-card";
import {
  CRYPTO_HOME_TICKERS,
  aiChangeBars,
  cryptoChangeBars,
  nextCryptoCatalystLine,
  nextTickerCatalystLine,
  type HomeMove,
} from "@/lib/home-lines";
import { inScopeBankrollPoints, predictionsTierBar } from "@/lib/home-visuals";
import { parseLotRangeQuery } from "@/lib/lot-range";
import { legacyParentHref, parentById } from "@/lib/node-parents";
import { yahooSessionDay } from "@/lib/equity-chart";
import { rollupHoldingBooks } from "@/lib/position-lots";
import { isPublicMode } from "@/lib/public-mode-server";
import { loadCryptoCloses, loadEquityCloses, loadXrpTriggerCloses, xrpTriggerAgeLabel } from "@/lib/price-history";
import { evaluateXrpTrigger } from "@/lib/xrp-trigger";
import { loadOperatorFills } from "@/lib/sleeve-prints";
import { loadBetsForPage, loadCalendarForPage } from "@/lib/store-page";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { suiBalanceLine } from "@/lib/sui-balance-line";
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
  searchParams,
}: {
  params: Promise<{ parent: string }>;
  searchParams: Promise<{ range?: string | string[]; steps?: string | string[]; runs?: string | string[] }>;
}) {
  const [{ parent: id }, query] = await Promise.all([params, searchParams]);
  const range = parseLotRangeQuery(query.range);
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
          <PublicFightRecord
            record={publicRecordLabel(bankroll.ledger?.recordLabel ?? bankroll.bookFacts?.recordLabel)}
          />
        </OperatorShell>
      );
    }
    if (parent.id === "crypto" || parent.id === "ai-stocks") {
      const [floor, calendar, triggerCloses] = await Promise.all([
        loadPublicFloor(),
        loadCalendarForPage(),
        parent.id === "crypto" ? loadXrpTriggerCloses() : Promise.resolve(null),
      ]);
      const group = parent.id === "crypto" ? floor.model.crypto : floor.model.aiStocks;
      const now = new Date();
      const catalyst =
        parent.id === "crypto" ? nextCryptoCatalystLine(calendar.events, now) : null;
      const safeCatalyst = catalyst && !hasMoneyText(catalyst) ? catalyst : null;
      const trigger =
        parent.id === "crypto" ? (
          <XrpTriggerCard
            view={evaluateXrpTrigger(triggerCloses ?? [], now)}
            publicMode
            staleLabel={triggerCloses ? xrpTriggerAgeLabel(now) : null}
          />
        ) : null;
      return (
        <OperatorShell storageMessage={floor.storageMessage} storageDetail={floor.storageDetail}>
          <Link href="/" className="calendar-back">
            Floor
          </Link>
          {parent.id === "ai-stocks" ? (
            <CatalystEntry events={calendar.events.map((event) => scrubTextFields(event))} now={now} />
          ) : null}
          {safeCatalyst ? (
            <p className="parent-retiring">
              <Link href="/calendar" className="parent-line-link">
                {safeCatalyst}
              </Link>
            </p>
          ) : null}
          <PublicGroupFloor
            group={group}
            bars={floor.groupBars[parent.id]}
            treasury={parent.id === "crypto"}
            extra={trigger}
            range={range}
          />
        </OperatorShell>
      );
    }
  }

    if (parent.id === "fight-desk") {
      const [floor, bankroll, calendar, book] = await Promise.all([
        loadOperatorFloor(),
        loadBankroll(),
        loadCalendarForPage(),
        loadBetsForPage(),
      ]);
      const bets = book.status === "unavailable" ? [] : book.bets;
      const ledger = bankroll.ledger;
      return (
        <OperatorShell
          storageMessage={
            floor.storageMessage ??
            (bankroll.status === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null)
          }
          storageDetail={floor.storageDetail ?? bankroll.storageDetail}
        >
          <PredictionsFloor
            ledger={ledger}
            bookFacts={ledger ? null : bankroll.bookFacts}
            segments={
              ledger
                ? predictionsTierBar(ledger.tiers.map((tier) => ({ id: tier.id, atRiskLabel: tier.atRiskLabel })))
                : null
            }
            bankrollLine={inScopeBankrollPoints(bets, calendar.events)}
          />
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
    await requireRole("owner");
    const stepsRange = parseStoryRange(query.steps);
    const runsRange = parseStoryRange(query.runs);
    const [floor, bundle, publicMode, manual] = await Promise.all([
      loadOperatorFloor(),
      loadFitnessBundle(),
      isPublicMode(),
      loadFitnessManual(),
    ]);
    const story = buildFitnessStory({
      metrics: bundle.metrics,
      workouts: [
        ...bundle.workouts,
        ...shortcutWorkoutsAsWrites(bundle.shortcutWorkouts),
        ...nrcRunsAsWrites(bundle.nrcRuns),
      ],
      manuals: manual.entries,
      today: bundle.today,
      publicMode,
      stepsRange,
      runsRange,
    });
    return (
      <OperatorShell
        storageMessage={
          floor.storageMessage ??
          (bundle.availability === "unavailable" || manual.availability === "unavailable"
            ? STORAGE_UNAVAILABLE_BANNER
            : null)
        }
        storageDetail={floor.storageDetail}
      >
        <Link href="/" className="calendar-back">
          Floor
        </Link>
        <FitnessStoryView story={story} stepsRange={stepsRange} runsRange={runsRange} />
        {publicMode ? null : (
          <FitnessTokenCopy configured={Boolean(process.env.FITNESS_INGEST_TOKEN?.trim())} />
        )}
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
  const now = new Date();
  const cards = Object.fromEntries(
    Object.entries(floor.faces).map(([ticker, face]) => [ticker, valueCardFromFace(face, now)]),
  );
  const heldUsd = Object.fromEntries(
    Object.entries(floor.faces).map(([ticker, face]) => [ticker, face.totalUsd]),
  );
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
        statusLine: ticker === "SUI" ? suiBalanceLine(floor.suiBalance) : null,
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
  const glanceBars =
    parent.id === "crypto"
      ? cryptoChangeBars(
          CRYPTO_HOME_TICKERS.map((ticker) => quoteMove(ticker, floor.spotQuotes[ticker])),
          now,
        )
      : parent.id === "ai-stocks"
        ? aiChangeBars(
            AI_STOCK_TICKERS.map((ticker) => quoteMove(ticker, floor.equityQuotes[ticker])),
            now,
          )
        : null;
  const cryptoCatalyst = parent.id === "crypto" ? nextCryptoCatalystLine(events, now) : null;
  const today = yahooSessionDay(now.getTime() / 1000) ?? "";
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
      <ParentGlance bars={glanceBars} catalyst={cryptoCatalyst} catalystHref="/calendar" />
      <NodeGrid
        parentId={parent.id}
        parentLabel={parent.label}
        cards={cards}
        heldUsd={heldUsd}
        childCards={childParent ? childCards : undefined}
        extra={
          parent.id === "crypto" ? (
            <XrpTriggerCard
              view={evaluateXrpTrigger(triggerCloses ?? [], now)}
              publicMode={false}
              staleLabel={triggerCloses ? xrpTriggerAgeLabel(now) : null}
            />
          ) : null
        }
      />
      {childParent && book && dated ? (
        <PositionRollupView
          parentId={parent.id}
          publicMode={await isPublicMode()}
          range={range}
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

function quoteMove(
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

