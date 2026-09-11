"use client";

import Link from "next/link";
import { ClassBadge, ProvenanceBadge, StatusBadge } from "@/components/badges";
import { EmptyState, PageHeader } from "@/components/page-header";
import { NodePriceCell, Stat } from "@/components/ui";
import { usePrices } from "@/context/prices";
import { useStore } from "@/context/store";
import { formatUsd, formatUnits } from "@/lib/format";
import { sortLedger } from "@/lib/ledger";

export default function OverviewPage() {
  const { ready, state } = useStore();
  const { book, quoteFor } = usePrices();
  const xrp = quoteFor("XRP");
  const treasuryUsd =
    xrp && Number.isFinite(state.treasury.units)
      ? state.treasury.units * xrp.usd
      : null;
  const dailyUsd =
    xrp && Number.isFinite(state.treasury.estimatedDailyReward)
      ? state.treasury.estimatedDailyReward * xrp.usd
      : null;
  const funded = state.nodes.filter((node) => node.status === "funded");
  const watch = state.nodes.filter((node) => node.status === "watch");
  const none = state.nodes.filter((node) => node.status === "none");
  const lastDecisions = [...state.decisions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3);
  const lastClaims = sortLedger(state.ledger).slice(0, 3);

  if (!ready) {
    return <p className="text-sm text-[color:var(--muted)]">Loading local books…</p>;
  }

  return (
    <div>
      <PageHeader
        kicker="Home"
        title="Overview"
        description={`${state.settings.operatorName}'s Phase Zero board. Figures below are founder-reported until a read-only feed verifies them.`}
      />

      <div className="notice notice-warn mb-8">
        Phase Zero is human-governed. Resonance does not import seeds, request
        private keys, sign transactions, launch tokens, or write on-chain.
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Working treasury"
          value={formatUnits(state.treasury.units, state.treasury.asset)}
          hint={
            <span className="flex flex-wrap items-center gap-2">
              <ProvenanceBadge value={state.treasury.provenance} />
              {state.treasury.venue} · {state.treasury.locationNote}
            </span>
          }
        />
        <Stat
          label="Est. USD"
          value={formatUsd(treasuryUsd)}
          hint={
            xrp ? (
              <span className="flex flex-wrap items-center gap-2">
                <ProvenanceBadge value="verified" />
                XRP {formatUsd(xrp.usd)} via {book.crypto.source ?? "live feed"}
              </span>
            ) : (
              <span>
                {book.crypto.status === "error"
                  ? "Live XRP price unavailable — USD not estimated."
                  : "Waiting for a live XRP price. No placeholder used."}
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
              ? `≈ ${formatUsd(dailyUsd)} / day at last live XRP print`
              : "Founder-reported rate. Convert to USD when XRP prints."
          }
        />
        <Stat
          label="Node posture"
          value={`${funded.length} funded`}
          hint={`${watch.length} watch · ${none.length} none · 12 tracked`}
        />
      </div>

      <section className="card mb-8">
        <p className="kicker">Operating priority</p>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[color:var(--text)]">
          {state.settings.operatingPriority}
        </p>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg">Nodes</h2>
          <Link href="/nodes" className="text-sm text-[color:var(--accent)]">
            Open board
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {state.nodes.map((node) => (
            <div key={node.ticker} className="card py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm">{node.ticker}</p>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">
                    {node.name}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge value={node.status} />
                  <ClassBadge value={node.class} />
                </div>
              </div>
              <div className="mt-4">
                <NodePriceCell
                  node={node}
                  live={quoteFor(node.ticker)}
                  liveStatus={
                    node.class === "digital"
                      ? book.crypto.status
                      : book.equities.status
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-lg">Last decisions</h2>
            <Link href="/decisions" className="text-sm text-[color:var(--accent)]">
              Log
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
                <div key={item.id} className="card">
                  <div className="flex items-center justify-between gap-3">
                    <p className="kicker">{item.date}</p>
                    <StatusAsDecision status={item.status} />
                  </div>
                  <p className="mt-2 text-sm">{item.question}</p>
                  {item.status === "decided" && item.decision ? (
                    <p className="mt-2 text-sm text-[color:var(--muted)]">
                      {item.decision}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-[color:var(--muted)]">
                      Still open. Options: {item.options || "not listed"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-lg">Reward ledger</h2>
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

function StatusAsDecision({ status }: { status: "pending" | "decided" }) {
  return (
    <span
      className={`badge ${
        status === "decided"
          ? "border-[color:var(--ok)]/40 bg-[color:var(--ok)]/10 text-[color:var(--ok)]"
          : "border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
      }`}
    >
      {status === "decided" ? "Decided" : "Pending"}
    </span>
  );
}
