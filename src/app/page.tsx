"use client";

import Link from "next/link";
import {
  ClassBadge,
  DecisionStatusBadge,
  IntentStatusBadge,
  ProvenanceBadge,
  SleeveBadge,
  StatusBadge,
  VenueBadge,
} from "@/components/badges";
import { EmptyState, PageHeader } from "@/components/page-header";
import { WhatsNewCard } from "@/components/whats-new";
import { NodePriceCell, Stat } from "@/components/ui";
import { usePrices } from "@/context/prices";
import { useStore } from "@/context/store";
import { formatHoldingAmount, formatTimestamp, formatUsd, formatUnits } from "@/lib/format";
import { hasHoldings, latestHoldingsSync } from "@/lib/holdings-snapshot";
import type { Node, Quote } from "@/lib/types";
import { sortLedger } from "@/lib/ledger";
import { digitalNodes, physicalNodes, queuedAgenticIntents } from "@/lib/robinhood";
import { xrpUsdRate } from "@/lib/valuation";

export default function OverviewPage() {
  const { ready, state } = useStore();
  const { book, quoteFor } = usePrices();
  const xrp = quoteFor("XRP");
  const rate = xrpUsdRate(xrp?.usd, state.treasury.manualUsdPerXrp);
  const treasuryUsd =
    rate && Number.isFinite(state.treasury.units)
      ? state.treasury.units * rate.usd
      : null;
  const dailyUsd =
    rate && Number.isFinite(state.treasury.estimatedDailyReward)
      ? state.treasury.estimatedDailyReward * rate.usd
      : null;
  const funded = state.nodes.filter((node) => node.status === "funded");
  const watch = state.nodes.filter((node) => node.status === "watch");
  const none = state.nodes.filter((node) => node.status === "none");
  const lastDecisions = [...state.decisions]
    .sort((a, b) => {
      const aOfficial = a.id.startsWith("D-") ? 1 : 0;
      const bOfficial = b.id.startsWith("D-") ? 1 : 0;
      if (aOfficial !== bOfficial) return bOfficial - aOfficial;
      return (
        b.date.localeCompare(a.date) ||
        b.createdAt.localeCompare(a.createdAt) ||
        b.id.localeCompare(a.id)
      );
    })
    .slice(0, 4);
  const lastClaims = sortLedger(state.ledger).slice(0, 3);
  const holdingsSync = latestHoldingsSync(state.nodes);
  const digital = digitalNodes(state.nodes);
  const physical = physicalNodes(state.nodes);
  const queued = queuedAgenticIntents(state.agenticIntents);

  if (!ready) {
    return <p className="text-sm text-[color:var(--muted)]">Loading local books…</p>;
  }

  return (
    <div>
      <PageHeader
        kicker="Home"
        title="Overview"
        description={`${state.settings.operatorName}'s Phase Zero board. Private surface: exact XRP, RH ties, receipts. Shareable skeleton is /public (target % only). Live prices are optional. Figures are founder-reported until a read-only feed verifies them.`}
        actions={
          <Link href="/public" className="btn btn-secondary">
            Public skeleton
          </Link>
        }
      />

      <WhatsNewCard compact />

      <div className="notice mb-8">
        Phase Zero is human-governed and manual-first. Resonance does not import
        seeds, request private keys, sign transactions, launch tokens, write
        on-chain, or place silent Main trades. Live market prints are optional
        and never invented when a feed is down.
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Working treasury"
          value={formatUnits(state.treasury.units, state.treasury.asset)}
          hint={
            <span className="flex flex-wrap items-center gap-2">
              <ProvenanceBadge value={state.treasury.provenance} />
              <VenueBadge value={state.treasury.venue} />
              {state.treasury.locationNote}
            </span>
          }
        />
        <Stat
          label="Est. USD"
          value={formatUsd(treasuryUsd)}
          hint={
            rate ? (
              <span className="flex flex-wrap items-center gap-2">
                <ProvenanceBadge value={rate.provenance} />
                XRP {formatUsd(rate.usd)} · {rate.label}
                {book.crypto.source && rate.provenance === "verified"
                  ? ` (${book.crypto.source})`
                  : ""}
              </span>
            ) : (
              <span>
                No live XRP print and no manual XRP/USD. Type a rate on Treasury
                if you want an estimate. Nothing is invented.
              </span>
            )
          }
        />
        <Stat
          label="~Daily reward"
          value={formatUnits(
            state.treasury.estimatedDailyReward,
            state.treasury.asset,
          )}
          hint={
            dailyUsd !== null
              ? `≈ ${formatUsd(dailyUsd)} / day at ${rate?.label ?? "last"} XRP print`
              : "Founder-reported rate. Add a live or manual XRP/USD to convert."
          }
        />
        <Stat
          label="Node posture"
          value={`${funded.length} funded`}
          hint={`${watch.length} watch · ${none.length} none · 12 tracked`}
        />
      </div>

      {holdingsSync ? (
        <p className="mb-8 text-sm text-[color:var(--muted)]">
          Holdings last synced {formatTimestamp(holdingsSync.at)} from{" "}
          <span className="font-mono">{holdingsSync.source}</span>. Pasted JSON
          snapshot — not a live Robinhood link.
        </p>
      ) : null}

      <section className="card mb-8">
        <p className="kicker">Operating priority</p>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[color:var(--text)]">
          {state.settings.operatingPriority}
        </p>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg">Skeleton nodes</h2>
          <div className="flex gap-4">
            <Link href="/robinhood" className="text-sm text-[color:var(--accent)]">
              Sleeves
            </Link>
            <Link href="/nodes" className="text-sm text-[color:var(--accent)]">
              Open board
            </Link>
          </div>
        </div>
        <div className="mb-6">
          <p className="kicker mb-3">Physical AI</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {physical.map((node) => (
              <SkeletonNodeCard
                key={node.ticker}
                node={node}
                live={quoteFor(node.ticker)}
                liveStatus={book.equities.status}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="kicker mb-3">Digital</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {digital.map((node) => (
              <SkeletonNodeCard
                key={node.ticker}
                node={node}
                live={quoteFor(node.ticker)}
                liveStatus={book.crypto.status}
              />
            ))}
          </div>
        </div>
      </section>

      {queued.length > 0 ? (
        <section className="mb-8">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-lg">Agentic queued</h2>
            <Link href="/robinhood" className="text-sm text-[color:var(--accent)]">
              Robinhood panel
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {queued.map((intent) => (
              <div key={intent.id} className="card py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-sm">{intent.ticker}</p>
                  <SleeveBadge value="agentic" />
                  <IntentStatusBadge value={intent.status} />
                </div>
                <p className="mt-2 text-sm text-[color:var(--muted)]">
                  {intent.authorizedByDecisionId}
                  {intent.notionalUsd != null
                    ? ` · ${intent.notionalUsd} USD`
                    : " · autonomy"}
                  {" · Monday open"}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-lg">Last decisions</h2>
            <Link href="/decisions" className="text-sm text-[color:var(--accent)]">
              Record book
            </Link>
          </div>
          {lastDecisions.length === 0 ? (
            <EmptyState
              title="No decisions yet"
              body="Write the live question on the Decisions screen so the board has a next action."
            />
          ) : (
            <div className="space-y-3">
              {lastDecisions.map((item) => (
                <Link
                  key={item.id}
                  href={`/decisions/${encodeURIComponent(item.id)}`}
                  className="card block"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="kicker">{item.date}</p>
                      <span className="badge border-[color:var(--border)] font-mono text-[color:var(--text)]">
                        {item.id}
                      </span>
                    </div>
                    <DecisionStatusBadge value={item.status} />
                  </div>
                  <p className="mt-2 text-sm">{item.question}</p>
                  {item.status !== "pending" && item.decision ? (
                    <p className="mt-2 text-sm text-[color:var(--muted)]">
                      {item.decision}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-[color:var(--muted)]">
                      Still open. Options: {item.options || "not listed"}
                    </p>
                  )}
                  {item.outcome ? (
                    <p className="mt-2 text-xs text-[color:var(--muted)]">
                      Outcome: {item.outcome}
                    </p>
                  ) : null}
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-lg">Treasury trail</h2>
            <Link href="/treasury" className="text-sm text-[color:var(--accent)]">
              Treasury
            </Link>
          </div>
          {lastClaims.length === 0 ? (
            <EmptyState
              title="Ledger is empty"
              body="Add a claim on Treasury: date, amount, fee, note, and whether it is principal, reward, fee, or transfer."
            />
          ) : (
            <div className="space-y-3">
              {lastClaims.map((entry) => (
                <div key={entry.id} className="card">
                  <div className="flex items-center justify-between gap-3">
                    <p className="kicker">
                      {entry.date} · {entry.classification}
                    </p>
                    <p className="font-mono text-sm tabular-nums">
                      {formatUnits(entry.amount, "XRP")}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-[color:var(--muted)]">
                    {entry.note || "No note"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {state.settings.showYoutubeStub ? (
        <section className="card mt-8">
          <p className="kicker">Later · earning machine</p>
          <h2 className="mt-2 text-lg">YouTube stub</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
            Optional later: treat YouTube as an earning machine. Not in Phase
            Zero scope. No cadence, no revenue, no upload pipeline here — only
            this reminder. Toggle it off in Settings when you do not want it on
            the board.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function SkeletonNodeCard({
  node,
  live,
  liveStatus,
}: {
  node: Node;
  live: Quote | null;
  liveStatus: "idle" | "loading" | "ok" | "error";
}) {
  return (
    <div className="card py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm">{node.ticker}</p>
          <p className="mt-1 text-sm text-[color:var(--muted)]">{node.name}</p>
          {hasHoldings(node) ? (
            <p className="mt-2 font-mono text-xs tabular-nums text-[color:var(--muted)]">
              {formatHoldingAmount(node.quantity)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge value={node.status} />
          <ClassBadge value={node.class} />
          <SleeveBadge value={node.sleeve} />
          {node.venue ? <VenueBadge value={node.venue} /> : null}
        </div>
      </div>
      <div className="mt-4">
        <NodePriceCell node={node} live={live} liveStatus={liveStatus} />
      </div>
    </div>
  );
}

