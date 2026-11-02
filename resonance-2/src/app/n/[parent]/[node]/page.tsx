import { notFound, permanentRedirect, redirect } from "next/navigation";
import { ChildValueCard } from "@/components/child-value-card";
import { EmptyCard, NodeGrid, NodeHeader, NodeLayout, NodeSection, NodeSections } from "@/components/node-layout";
import { ValueStatCard } from "@/components/value-stat";
import { PositionBook } from "@/components/position-book";
import { PublicNodePage, TreasuryCard } from "@/components/public-floor";
import { FinanceDetail } from "@/components/finance-detail";
import { FinanceWaiting } from "@/components/finance-floor";
import { PrivatePage } from "@/components/private-notice";
import { FitnessDetail } from "@/components/fitness-detail";
import { manualImportDetail } from "@/lib/fitness-manual";
import { loadFitnessManual } from "@/lib/fitness-manual-store";
import { LiveNodeFace } from "@/components/live-node-face";
import { BankrollLedgerView } from "@/components/predictions-floor";
import { OperatorShell } from "@/components/operator-shell";
import { requireRole } from "@/lib/auth-session";
import { loadBankroll } from "@/lib/bankroll-load";
import { loadFinancePage, readFinanceNetWorthSeries } from "@/lib/finance/store";
import { financeDetail, financeNode } from "@/lib/finance/view";
import { FLOOR_NODES } from "@/data/floor-nodes";
import type { NodeSleeve } from "@/data/sleeves";
import { fillDeskHref } from "@/lib/fill-desk";
import { FITNESS_NODES, fitnessLegacyHref, publicFitnessDetail } from "@/lib/fitness-board";
import { parseStepSpan } from "@/lib/fitness-present";
import { loadFitnessNode } from "@/lib/fitness-store";
import { aiStockRole } from "@/data/ai-stock-roles";
import { retiredAiNodeHref } from "@/lib/ai-stocks";
import { retiredCryptoNodeHref } from "@/lib/crypto-nodes";
import { holdingChildModel, positionLines, priceSpark, type ChildCardModel } from "@/lib/child-card";
import { isDecimalString } from "@/lib/decimal";
import { isEquityTicker } from "@/lib/equity-price";
import { nextTickerCatalystLine } from "@/lib/home-lines";
import { latestTimestamp, type NodePart } from "@/lib/node-layout";
import { legacyParentHref, nodeParent, parentById } from "@/lib/node-parents";
import { loadOperatorFloor, type OperatorFloor } from "@/lib/operator-floor";
import { loadPublicFloor } from "@/lib/public-load";
import { positionCostFromFills } from "@/lib/position-cost";
import { assembleNodePosition, displayLotBooks } from "@/lib/position-lots";
import { isPublicMode } from "@/lib/public-mode-server";
import { yahooSessionDay } from "@/lib/equity-chart";
import { parseLotRangeQuery } from "@/lib/lot-range";
import { loadCryptoCloses, loadEquityCloses, loadEquityHistory } from "@/lib/price-history";
import { loadOperatorFills } from "@/lib/sleeve-prints";
import { loadCalendarForPage } from "@/lib/store-page";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { suiBalanceLine } from "@/lib/sui-balance-line";
import { valueCardFromFace } from "@/lib/value-card";

export const dynamic = "force-dynamic";

function sleevesFor(floor: OperatorFloor, ticker: string): readonly NodeSleeve[] | undefined {
  const books: Record<string, readonly NodeSleeve[] | undefined> = floor.sleeves;
  return books[ticker];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ parent: string; node: string }>;
}) {
  const { parent: parentId, node: nodeId } = await params;
  const retiredName = retiredEquityTicker(parentId, nodeId);
  if (retiredName) {
    const parent = parentById(parentId);
    return { title: `${retiredName} · ${parent?.label ?? "AI Stocks"} · Resonance 2.0` };
  }
  const retired = retiredAiNodeHref(parentId, nodeId) ?? retiredCryptoNodeHref(parentId, nodeId);
  if (retired) redirect(retired);
  if (parentId === "fitness") {
    const moved = fitnessLegacyHref(nodeId);
    if (moved) permanentRedirect(moved);
  }
  const parent = parentById(parentId);
  if (parent?.id === "finance") {
    const node = financeNode(nodeId);
    const title = node ? `${node.title} · ${parent.label}` : "Node";
    return { title: `${title} · Resonance 2.0` };
  }
  if (parent?.id === "fitness") {
    const node = FITNESS_NODES.find((item) => item.id === nodeId);
    const title = node ? `${node.title} · ${parent.label}` : "Node";
    return { title: `${title} · Resonance 2.0` };
  }
  if (parent?.id === "fight-desk" && nodeId === "bankroll") {
    return { title: `Bankroll · ${parent.label} · Resonance 2.0` };
  }
  const node = FLOOR_NODES.find((item) => item.id === nodeId);
  const title = node && parent ? `${node.ticker} · ${parent.label}` : "Node";
  return { title: `${title} · Resonance 2.0` };
}

export default async function NodeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ parent: string; node: string }>;
  searchParams: Promise<{ range?: string | string[]; span?: string | string[] }>;
}) {
  const [{ parent: parentId, node: nodeId }, query] = await Promise.all([params, searchParams]);
  const range = parseLotRangeQuery(query.range);
  const retiredName = retiredEquityTicker(parentId, nodeId);
  if (retiredName) return retiredEquityPage(retiredName, range);
  const retired = retiredAiNodeHref(parentId, nodeId) ?? retiredCryptoNodeHref(parentId, nodeId);
  if (retired) redirect(retired);
  const legacy = legacyParentHref(parentId, nodeId);
  if (legacy) {
    if (parentId === "predictions") permanentRedirect(legacy);
    redirect(legacy);
  }
  if (parentId === "fitness") {
    const moved = fitnessLegacyHref(nodeId);
    if (moved) permanentRedirect(moved);
  }
  const parent = parentById(parentId);
  if (await isPublicMode()) {
    if (parent?.id === "crypto" || parent?.id === "ai-stocks") {
      const node = FLOOR_NODES.find((item) => item.id === nodeId && item.status !== "empty");
      if (!node || nodeParent(node.id) !== parent.id) notFound();
      if (node.ticker === "XRP") {
        return (
          <OperatorShell>
            <NodeLayout>
              <NodeHeader name="Treasury" parts={["live"]} backHref={`/n/${parent.id}`} />
              <NodeSections>
                <NodeSection kind="lists">
                  <TreasuryCard />
                </NodeSection>
              </NodeSections>
            </NodeLayout>
          </OperatorShell>
        );
      }
      const floor = await loadPublicFloor();
      const group = parent.id === "crypto" ? floor.model.crypto : floor.model.aiStocks;
      const holding = group.holdings.find((item) => item.id === node.id) ?? null;
      return (
        <OperatorShell storageMessage={floor.storageMessage} storageDetail={floor.storageDetail}>
          <NodeLayout>
            <NodeHeader
              name={node.ticker}
              parts={holding?.weightLabel ? ["live"] : ["missing"]}
              backHref={`/n/${parent.id}`}
            />
            <NodeSections>
              <NodeSection kind="numbers">
                <PublicNodePage
                  ticker={node.ticker}
                  holding={holding}
                  bars={floor.nodeBars[node.ticker] ?? []}
                  range={range}
                />
              </NodeSection>
            </NodeSections>
          </NodeLayout>
        </OperatorShell>
      );
    }
  }
  if (parent?.id === "finance") {
    if (await isPublicMode()) return <PrivatePage />;
    await requireRole("owner");
    if (!financeNode(nodeId)) notFound();
    const finance = await loadFinancePage();
    const series = finance.status === "live" ? await readFinanceNetWorthSeries() : [];
    const detail = finance.status === "live" ? financeDetail(finance.snapshot, nodeId, series) : null;
    return (
      <OperatorShell
        storageMessage={finance.status === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null}
      >
        {finance.status === "live" && detail ? (
          <FinanceDetail
            detail={detail}
            asOf={finance.snapshot.asOf}
            stale={finance.stale}
            updatedAt={finance.storedAt}
            backHref={`/n/${parent.id}`}
          />
        ) : (
          <NodeLayout>
            <NodeHeader name={financeNode(nodeId)?.title ?? "Finance"} parts={["missing"]} backHref={`/n/${parent.id}`} />
            <NodeSections>
              <NodeSection kind="lists" empty />
            </NodeSections>
            {finance.status === "waiting" ? <FinanceWaiting /> : null}
          </NodeLayout>
        )}
      </OperatorShell>
    );
  }
  if (parent?.id === "fitness") {
    await requireRole("owner");
    if (nodeId === "manual") {
      const [floor, manual, publicMode] = await Promise.all([
        loadOperatorFloor(),
        loadFitnessManual(),
        isPublicMode(),
      ]);
      return (
        <OperatorShell
          storageMessage={
            floor.storageMessage ??
            (manual.availability === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null)
          }
          storageDetail={floor.storageDetail}
        >
          <FitnessDetail
            detail={manualImportDetail(manual.entries, { publicMode })}
            publicMode={publicMode}
          />
        </OperatorShell>
      );
    }
    if (nodeId === "steps" || nodeId === "runs" || nodeId === "analytics") {
      const hash = nodeId === "runs" ? "activity" : nodeId === "analytics" ? "analytics" : "steps";
      const span = nodeId === "steps" ? `?span=${parseStepSpan(query.span)}` : "";
      permanentRedirect(`/n/fitness${span}#${hash}`);
    }
    const [floor, fitness, publicMode] = await Promise.all([
      loadOperatorFloor(),
      loadFitnessNode(nodeId),
      isPublicMode(),
    ]);
    if (!fitness.detail) notFound();
    const detail = publicMode ? publicFitnessDetail(fitness.detail) : fitness.detail;
    return (
      <OperatorShell
        storageMessage={
          floor.storageMessage ??
          (fitness.availability === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null)
        }
        storageDetail={floor.storageDetail}
      >
        <FitnessDetail detail={detail} publicMode={publicMode} updatedAt={fitness.updatedAt} />
      </OperatorShell>
    );
  }
  if (parent?.id === "fight-desk") {
    if (nodeId !== "bankroll") notFound();
    const [floor, bankroll, publicMode] = await Promise.all([
      loadOperatorFloor(),
      loadBankroll(),
      isPublicMode(),
    ]);
    return (
      <OperatorShell
        storageMessage={
          floor.storageMessage ??
          (bankroll.status === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null)
        }
        storageDetail={floor.storageDetail ?? bankroll.storageDetail}
      >
        {bankroll.ledger ? (
          <BankrollLedgerView
            ledger={bankroll.ledger}
            deposits={bankroll.deposits}
            publicMode={publicMode}
          />
        ) : (
          <NodeLayout>
            <NodeHeader name="Bankroll" parts={["missing"]} backHref={`/n/${parent.id}`} />
            <NodeSections>
              <NodeSection kind="numbers">
                <NodeGrid>
                  <EmptyCard label="Bankroll" />
                </NodeGrid>
              </NodeSection>
            </NodeSections>
            {publicMode || !bankroll.storageDetail ? null : <p className="node-note">{bankroll.storageDetail}</p>}
          </NodeLayout>
        )}
      </OperatorShell>
    );
  }

  const node = FLOOR_NODES.find((item) => item.id === nodeId && item.status !== "empty");
  if (!parent || !node || nodeParent(node.id) !== parent.id) notFound();

  if (parent.id === "ai-stocks" && isEquityTicker(node.ticker)) {
    const ticker = node.ticker;
    const [floor, calendar, history, book, dated] = await Promise.all([
      loadOperatorFloor(),
      loadCalendarForPage(),
      loadEquityHistory([ticker]),
      loadOperatorFills(),
      loadEquityCloses([ticker]),
    ]);
    const face = floor.faces[ticker];
    const sleeves = sleevesFor(floor, ticker) ?? [];
    const agentic = sleeves.find((row) => row.id === "rh-agentic");
    const quantity =
      agentic && isDecimalString(agentic.quantity) && Number(agentic.quantity) > 0
        ? agentic.quantity
        : null;
    const quote = floor.equityQuotes[ticker];
    const now = new Date();
    const catalyst = nextTickerCatalystLine(calendar.events, ticker, now);
    const series = history[ticker] ?? null;
    const cost = quantity
      ? positionCostFromFills({
          fills: book.fills,
          ticker,
          quantity,
          priceUsd: face?.priceUsd ?? null,
        })
      : null;
    const model: ChildCardModel = face
      ? holdingChildModel({
          face,
          changePct: typeof quote?.change24hPct === "number" ? quote.change24hPct : null,
          fetchedAt: quote?.fetchedAt ?? null,
          now,
          catalyst,
          history: series,
          role: aiStockRole(ticker),
          position: positionLines(
            quantity,
            cost ? { averageLabel: cost.averageLabel, pnl: cost.pnl } : null,
          ),
          catalystAfterChart: true,
        })
      : {
          ticker,
          headline: null,
          priceLine: null,
          label: "not connected",
          lines: [],
          footerLines: catalyst ? [{ text: catalyst }] : [],
          spark: priceSpark(series),
          role: aiStockRole(ticker),
        };
    const hasFills = book.fills.some((fill) => fill.symbol.trim().toUpperCase() === ticker);
    const showBook = Boolean(quantity) || hasFills;
    const pageModel: ChildCardModel = showBook
      ? { ...model, spark: null, role: null }
      : model;
    const valueModel = {
      headline: pageModel.headline,
      priceLine: pageModel.priceLine,
      label: pageModel.label,
    };
    const equityParts: NodePart[] = pageModel.headline ? ["live"] : pageModel.priceLine ? ["partial"] : ["missing"];
    const chartModel = { ...pageModel, headline: null, priceLine: null, label: null };
    const hasChart =
      chartModel.lines.length > 0 ||
      chartModel.footerLines.length > 0 ||
      chartModel.spark !== null ||
      Boolean(chartModel.role);
    return (
      <OperatorShell
        storageMessage={floor.storageMessage}
        storageDetail={floor.storageDetail}
      >
        <NodeLayout>
          <NodeHeader
            name={ticker}
            parts={equityParts}
            updatedAt={latestTimestamp([quote?.fetchedAt])}
            backHref={`/n/${parent.id}`}
          />
          <NodeSections>
            <NodeSection kind="numbers">
              <NodeGrid>
                <ValueStatCard label={ticker} model={valueModel} />
              </NodeGrid>
            </NodeSection>
            <NodeSection kind="trends" empty={!hasChart}>
              {hasChart ? <ChildValueCard model={chartModel} wide /> : null}
            </NodeSection>
            <NodeSection kind="lists" empty={!showBook}>
              {showBook ? (
                <NodePosition
                  fills={book.fills}
                  ticker={ticker}
                  sleeves={sleeves}
                  priceUsd={face?.priceUsd ?? null}
                  closes={dated[ticker] ?? []}
                  range={range}
                />
              ) : null}
              {showBook && model.role ? <p className="child-role">{model.role}</p> : null}
            </NodeSection>
          </NodeSections>
        </NodeLayout>
      </OperatorShell>
    );
  }

  const cryptoChild = node.ticker === "XRP" || node.ticker === "SUI";
  const [floor, book, dated, calendar] = await Promise.all([
    loadOperatorFloor(),
    cryptoChild ? loadOperatorFills() : Promise.resolve(null),
    cryptoChild ? loadCryptoCloses([node.ticker as "XRP" | "SUI"]) : Promise.resolve(null),
    cryptoChild ? loadCalendarForPage() : Promise.resolve(null),
  ]);
  const sleeves = sleevesFor(floor, node.ticker);
  const face = floor.faces[node.ticker];
  const ready = Boolean(face && sleeves);
  const now = new Date();
  const quote = cryptoChild ? floor.spotQuotes[node.ticker as "XRP" | "SUI"] : null;
  const detailLines =
    cryptoChild && face
      ? holdingChildModel({
          face,
          changePct: typeof quote?.change24hPct === "number" ? quote.change24hPct : null,
          fetchedAt: quote?.fetchedAt ?? null,
          now,
          catalyst: nextTickerCatalystLine(calendar?.events ?? [], node.ticker, now),
          treasury: node.ticker === "XRP",
        }).lines
      : [];
  const valueModel = face ? valueCardFromFace(face, now) : null;
  const cryptoParts: NodePart[] = valueModel?.headline
    ? ["live"]
    : valueModel?.priceLine
      ? ["partial"]
      : ["missing"];
  const showBook = Boolean(cryptoChild && book);

  return (
    <OperatorShell
      storageMessage={floor.storageMessage}
      storageDetail={floor.storageDetail}
    >
      <NodeLayout>
        <NodeHeader
          name={node.ticker}
          parts={cryptoParts}
          updatedAt={latestTimestamp([quote?.fetchedAt, face?.fetchedAt])}
          backHref={`/n/${parent.id}`}
        />
        <NodeSections>
          <NodeSection kind="numbers">
            <NodeGrid>
              {ready && face && sleeves ? (
                <LiveNodeFace
                  key={node.ticker}
                  ticker={node.ticker}
                  sleeves={sleeves}
                  initial={face}
                  href={fillDeskHref({ ticker: node.ticker })}
                  statusLine={node.ticker === "SUI" ? suiBalanceLine(floor.suiBalance) : null}
                />
              ) : (
                <EmptyCard label={node.ticker} />
              )}
            </NodeGrid>
          </NodeSection>
          <NodeSection kind="lists" empty={detailLines.length === 0 && !showBook}>
            {detailLines.length > 0 ? (
              <ul className="parent-lines">
                {detailLines.map((line, index) => (
                  <li key={`${line.text}-${index}`} className={line.tone ? `is-${line.tone}` : undefined}>
                    {line.text}
                  </li>
                ))}
              </ul>
            ) : null}
            {showBook && book ? (
              <NodePosition
                fills={book.fills}
                ticker={node.ticker}
                sleeves={sleeves}
                priceUsd={face?.priceUsd ?? null}
                closes={dated?.[node.ticker] ?? []}
                vaultQuantity={sleeves?.find((row) => row.id === "flare-vault")?.quantity ?? null}
                range={range}
              />
            ) : null}
          </NodeSection>
        </NodeSections>
      </NodeLayout>
    </OperatorShell>
  );
}

async function NodePosition({
  fills,
  ticker,
  sleeves,
  priceUsd,
  closes,
  vaultQuantity = null,
  range,
}: {
  fills: Parameters<typeof assembleNodePosition>[0]["fills"];
  ticker: string;
  sleeves: readonly { id: string; quantity: string }[] | undefined;
  priceUsd: number | null;
  closes: { day: string; close: number }[];
  vaultQuantity?: string | null;
  range?: string | null;
}) {
  const today = yahooSessionDay(Date.now() / 1000) ?? "";
  const publicMode = await isPublicMode();
  const position = assembleNodePosition({
    fills,
    ticker,
    sleeves,
    priceUsd,
    closes,
    today,
    vaultQuantity,
  });
  if (!position) return null;
  return (
    <PositionBook
      ledger={position.ledger}
      quantity={position.quantity}
      livePrice={priceUsd}
      vaultLine={position.vaultLine}
      unknownShares={position.unknownShares}
      vaultShares={position.vaultShares}
      agenticLines={position.agenticLines}
      books={displayLotBooks(position.books, position.agenticLines.length > 0)}
      holdingUnits={position.holdingUnits}
      addedCostUsd={position.addedCostUsd}
      unexplained={position.unexplained}
      ticker={ticker}
      publicMode={publicMode}
      range={range}
    />
  );
}

function retiredEquityTicker(parentId: string, nodeId: string): "ETN" | "HUBB" | null {
  if (parentId !== "ai-stocks") return null;
  if (nodeId === "etn") return "ETN";
  if (nodeId === "hubb") return "HUBB";
  return null;
}

async function retiredEquityPage(ticker: "ETN" | "HUBB", range: string) {
  const parent = parentById("ai-stocks");
  if (!parent) notFound();
  const [floor, book] = await Promise.all([loadOperatorFloor(), loadOperatorFills()]);
  const sleeves = sleevesFor(floor, ticker) ?? [];
  return (
    <OperatorShell storageMessage={floor.storageMessage} storageDetail={floor.storageDetail}>
      <NodeLayout>
        <NodeHeader name={ticker} parts={["missing"]} backHref={`/n/${parent.id}`} />
        <p className="node-note">{ticker} · retired</p>
        <NodeSections>
          <NodeSection kind="numbers">
            <NodeGrid>
              <EmptyCard label={ticker} />
            </NodeGrid>
          </NodeSection>
          <NodeSection kind="lists">
            <NodePosition
              fills={book.fills}
              ticker={ticker}
              sleeves={sleeves}
              priceUsd={null}
              closes={[]}
              range={range}
            />
          </NodeSection>
        </NodeSections>
      </NodeLayout>
    </OperatorShell>
  );
}
