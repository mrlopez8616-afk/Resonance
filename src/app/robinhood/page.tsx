"use client";

import Link from "next/link";
import {
  ClassBadge,
  IntentStatusBadge,
  ProvenanceBadge,
  SleeveBadge,
  SnapshotBadge,
  StatusBadge,
  VenueBadge,
} from "@/components/badges";
import { PageHeader } from "@/components/page-header";
import { NodePriceCell, Stat } from "@/components/ui";
import { usePrices } from "@/context/prices";
import { useStore } from "@/context/store";
import { formatHoldingAmount, formatUsd, holdingToNumber } from "@/lib/format";
import { hasHoldings } from "@/lib/holdings-snapshot";
import {
  digitalNodes,
  mainLearningLots,
  physicalNodes,
  queuedAgenticIntents,
} from "@/lib/robinhood";

export default function RobinhoodPage() {
  const { ready, state } = useStore();
  const { book, quoteFor } = usePrices();
  const mainLots = mainLearningLots(state.nodes);
  const digital = digitalNodes(state.nodes);
  const physical = physicalNodes(state.nodes);
  const queued = queuedAgenticIntents(state.agenticIntents);
  const rhXrp = state.nodes.find((node) => node.ticker === "XRP");

  if (!ready) {
    return (
      <p className="text-sm text-[color:var(--muted)]">Loading Robinhood sleeves…</p>
    );
  }

  return (
    <div>
      <PageHeader
        kicker="Sleeves"
        title="Robinhood / Agentic"
        description="Two sleeves, one venue. Main is the founder learning account — read-only here, flatten Monday. Agentic is the autonomous risk sleeve. Resonance never places trades and never touches Main silently."
      />

      <div className="notice notice-warn mb-8">
        <p className="font-medium text-[color:var(--text)]">
          No silent Main trades. No brokerage session. Queued ≠ filled.
        </p>
        <p className="mt-2">
          Physical AI nodes: PWR ETN VRT GEV CEG HUBB. Digital rails: BTC ETH
          SOL XRP SUI FLR. Holdings below are founder-reported / verified-from-snapshot.
        </p>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat
          label="Main lots"
          value={`${mainLots.length} funded`}
          hint={
            <span className="flex flex-wrap items-center gap-2">
              <SleeveBadge value="main" />
              <VenueBadge value="Robinhood" />
              Flatten Monday · D-2026-09-11-01
            </span>
          }
        />
        <Stat
          label="Agentic queued"
          value={`${queued.length} tickets`}
          hint={
            <span className="flex flex-wrap items-center gap-2">
              <SleeveBadge value="agentic" />
              PWR VRT ETN GEV · Monday open
            </span>
          }
        />
        <Stat
          label="Xaman treasury"
          value={`${state.treasury.units.toLocaleString("en-US")} XRP`}
          hint={
            <span className="flex flex-wrap items-center gap-2">
              <ProvenanceBadge value="founder-reported" />
              <VenueBadge value="Xaman" />
              Off-limits to Agentic
            </span>
          }
        />
      </div>

      <section className="mb-10">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="kicker">Main</p>
            <h2 className="mt-1 text-lg">Read-only learning · flatten Monday</h2>
          </div>
          <Link href="/decisions" className="text-sm text-[color:var(--accent)]">
            D-2026-09-11-01
          </Link>
        </div>
        <p className="mb-4 max-w-3xl text-sm leading-6 text-[color:var(--muted)]">
          Founder Main account. Learning lots stay on the board until the
          written Monday market sells. This app does not flatten, size, or
          send Main orders.
        </p>
        <div className="grid gap-3">
          {mainLots.map((node) => {
            const avg = holdingToNumber(node.averageCost);
            return (
              <article key={node.ticker} className="card py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-mono text-lg">{node.ticker}</h3>
                      <ClassBadge value={node.class} />
                      <SleeveBadge value="main" />
                      <StatusBadge value={node.status} />
                      <VenueBadge value={node.venue || "Robinhood"} />
                      <SnapshotBadge />
                    </div>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">
                      {node.name}
                    </p>
                    <p className="mt-2 font-mono text-sm tabular-nums">
                      {formatHoldingAmount(node.quantity)}
                      {avg !== null ? ` @ ${formatUsd(avg)} avg` : ""}
                    </p>
                    <p className="mt-2 text-sm text-[color:var(--muted)]">
                      {node.holdingsNote || "Monday market sell queued — not filled."}
                    </p>
                  </div>
                  <NodePriceCell
                    node={node}
                    live={quoteFor(node.ticker)}
                    liveStatus={book.equities.status}
                  />
                </div>
              </article>
            );
          })}
        </div>
        {rhXrp && hasHoldings(rhXrp) ? (
          <div className="card mt-3 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-mono text-lg">XRP</h3>
              <ClassBadge value="digital" />
              <SleeveBadge value="main" />
              <VenueBadge value="Robinhood" />
              <ProvenanceBadge value="founder-reported" />
            </div>
            <p className="mt-2 font-mono text-sm tabular-nums">
              {formatHoldingAmount(rhXrp.quantity)} · not Xaman treasury
            </p>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              {rhXrp.holdingsNote}
            </p>
          </div>
        ) : null}
      </section>

      <section className="mb-10">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="kicker">Agentic</p>
            <h2 className="mt-1 text-lg">Autonomous risk sleeve</h2>
          </div>
          <Link href="/decisions" className="text-sm text-[color:var(--accent)]">
            D-2026-09-11-03 · D-04
          </Link>
        </div>
        <p className="mb-4 max-w-3xl text-sm leading-6 text-[color:var(--muted)]">
          Full Agentic autonomy is unlocked for this sleeve only (D-04). Sized
          PWR $35 and VRT $17 sit on D-03. ETN and GEV may be traded under
          D-04 autonomy. All four are QUEUED for Monday open — not filled.
          Main and Xaman principal stay off-limits.
        </p>
        <div className="grid gap-3">
          {queued.map((intent) => {
            const node = state.nodes.find((item) => item.ticker === intent.ticker);
            return (
              <article key={intent.id} className="card py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-mono text-lg">{intent.ticker}</h3>
                      <SleeveBadge value="agentic" />
                      <IntentStatusBadge value={intent.status} />
                      <VenueBadge value={intent.venue} />
                      <span className="badge border-[color:var(--border)] font-mono text-[color:var(--text)]">
                        {intent.authorizedByDecisionId}
                      </span>
                    </div>
                    <p className="mt-2 text-sm">
                      {intent.side.toUpperCase()}
                      {intent.notionalUsd != null
                        ? ` · ${formatUsd(intent.notionalUsd)} named size`
                        : " · autonomy, no fixed ticket"}
                    </p>
                    <p className="mt-2 text-sm text-[color:var(--muted)]">
                      {intent.note}
                    </p>
                  </div>
                  {node ? (
                    <NodePriceCell
                      node={node}
                      live={quoteFor(node.ticker)}
                      liveStatus={book.equities.status}
                    />
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg">Physical AI</h2>
          <div className="space-y-2">
            {physical.map((node) => (
              <div
                key={node.ticker}
                className="flex items-center justify-between rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2"
              >
                <span className="font-mono text-sm">{node.ticker}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <SleeveBadge value={node.sleeve} />
                  <StatusBadge value={node.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-lg">Digital</h2>
          <div className="space-y-2">
            {digital.map((node) => (
              <div
                key={node.ticker}
                className="flex items-center justify-between rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2"
              >
                <span className="font-mono text-sm">{node.ticker}</span>
                <div className="flex flex-wrap items-center gap-2">
                  {node.venue ? <VenueBadge value={node.venue} /> : null}
                  <StatusBadge value={node.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
