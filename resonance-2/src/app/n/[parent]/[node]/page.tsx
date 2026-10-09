import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { ChildValueCard } from "@/components/child-value-card";
import { FinanceDetail } from "@/components/finance-detail";
import { FinanceWaiting } from "@/components/finance-floor";
import { FitnessDetail } from "@/components/fitness-detail";
import { LiveNodeFace } from "@/components/live-node-face";
import { NodeSquare } from "@/components/node-square";
import { BankrollLedgerView } from "@/components/predictions-floor";
import { ValueCard } from "@/components/value-card";
import { OperatorShell } from "@/components/operator-shell";
import { requireRole } from "@/lib/auth-session";
import { loadBankroll } from "@/lib/bankroll-load";
import { loadFinancePage, readFinanceNetWorthSeries } from "@/lib/finance/store";
import { financeDetail, financeNode } from "@/lib/finance/view";
import { FLOOR_NODES } from "@/data/floor-nodes";
import type { NodeSleeve } from "@/data/sleeves";
import { fillDeskHref } from "@/lib/fill-desk";
import { FITNESS_NODES, fitnessLegacyHref } from "@/lib/fitness-board";
import { loadFitnessNode } from "@/lib/fitness-store";
import { aiStockRole } from "@/data/ai-stock-roles";
import { retiredAiNodeHref } from "@/lib/ai-stocks";
import { holdingChildModel, positionLines, priceSpark, type ChildCardModel } from "@/lib/child-card";
import { isDecimalString } from "@/lib/decimal";
import { isEquityTicker } from "@/lib/equity-price";
import { nextTickerCatalystLine } from "@/lib/home-lines";
import { legacyParentHref, nodeParent, parentById } from "@/lib/node-parents";
import { loadOperatorFloor, type OperatorFloor } from "@/lib/operator-floor";
import { positionCostFromFills } from "@/lib/position-cost";
import { loadEquityHistory } from "@/lib/price-history";
import { loadOperatorFills } from "@/lib/sleeve-prints";
import { loadCalendarForPage } from "@/lib/store-page";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

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
  const retired = retiredAiNodeHref(parentId, nodeId);
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
}: {
  params: Promise<{ parent: string; node: string }>;
}) {
  const { parent: parentId, node: nodeId } = await params;
  const retired = retiredAiNodeHref(parentId, nodeId);
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
  if (parent?.id === "finance") {
    await requireRole("owner");
    if (!financeNode(nodeId)) notFound();
    const finance = await loadFinancePage();
    const series = finance.status === "live" ? await readFinanceNetWorthSeries() : [];
    const detail = finance.status === "live" ? financeDetail(finance.snapshot, nodeId, series) : null;
    return (
      <OperatorShell
        storageMessage={finance.status === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null}
      >
        <Link href={`/n/${parent.id}`} className="calendar-back">
          {parent.label}
        </Link>
        {finance.status === "live" && detail ? (
          <FinanceDetail detail={detail} asOf={finance.snapshot.asOf} stale={finance.stale} />
        ) : finance.status === "waiting" ? (
          <FinanceWaiting />
        ) : null}
      </OperatorShell>
    );
  }
  if (parent?.id === "fitness") {
    const [floor, fitness] = await Promise.all([
      loadOperatorFloor(),
      loadFitnessNode(nodeId),
    ]);
    if (!fitness.detail) notFound();
    return (
      <OperatorShell
        storageMessage={
          floor.storageMessage ??
          (fitness.availability === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null)
        }
        storageDetail={floor.storageDetail}
      >
        <Link href={`/n/${parent.id}`} className="calendar-back">
          {parent.label}
        </Link>
        <FitnessDetail detail={fitness.detail} />
      </OperatorShell>
    );
  }
  if (parent?.id === "fight-desk") {
    if (nodeId !== "bankroll") notFound();
    const [floor, bankroll] = await Promise.all([loadOperatorFloor(), loadBankroll()]);
    return (
      <OperatorShell
        storageMessage={
          floor.storageMessage ??
          (bankroll.status === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null)
        }
        storageDetail={floor.storageDetail ?? bankroll.storageDetail}
      >
        <Link href={`/n/${parent.id}`} className="calendar-back">
          {parent.label}
        </Link>
        {bankroll.ledger ? (
          <BankrollLedgerView ledger={bankroll.ledger} />
        ) : (
          <p className="parent-empty" role="status">
            unavailable
          </p>
        )}
      </OperatorShell>
    );
  }

  const node = FLOOR_NODES.find((item) => item.id === nodeId && item.status !== "empty");
  if (!parent || !node || nodeParent(node.id) !== parent.id) notFound();

  if (parent.id === "ai-stocks" && isEquityTicker(node.ticker)) {
    const ticker = node.ticker;
    const [floor, calendar, history, book] = await Promise.all([
      loadOperatorFloor(),
      loadCalendarForPage(),
      loadEquityHistory([ticker]),
      loadOperatorFills(),
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
    return (
      <OperatorShell
        storageMessage={floor.storageMessage}
        storageDetail={floor.storageDetail}
      >
        <Link href={`/n/${parent.id}`} className="calendar-back">
          {parent.label}
        </Link>
        <div className="child-page">
          <ChildValueCard model={model} wide />
        </div>
      </OperatorShell>
    );
  }

  const floor = await loadOperatorFloor();
  const sleeves = sleevesFor(floor, node.ticker);
  const face = floor.faces[node.ticker];
  const ready = Boolean(face && sleeves);

  return (
    <OperatorShell
      storageMessage={floor.storageMessage}
      storageDetail={floor.storageDetail}
    >
      <Link href={`/n/${parent.id}`} className="calendar-back">
        {parent.label}
      </Link>
      <section className="node-grid" aria-label={`${node.ticker} node`}>
        <NodeSquare
          live={ready}
          dashed={!ready}
          label={ready ? `${node.ticker} live node` : `${node.ticker} not connected`}
        >
          {ready && face && sleeves ? (
            <Link
              href={fillDeskHref({ ticker: node.ticker })}
              className="node-log-link"
              title={`Open ${node.ticker} log`}
            >
              <span className="sr-only">Open {node.ticker} operator log</span>
              <LiveNodeFace ticker={node.ticker} sleeves={sleeves} initial={face} />
            </Link>
          ) : (
            <ValueCard
              ticker={node.ticker}
              model={{ headline: null, priceLine: null, label: "not connected" }}
            />
          )}
        </NodeSquare>
      </section>
    </OperatorShell>
  );
}
