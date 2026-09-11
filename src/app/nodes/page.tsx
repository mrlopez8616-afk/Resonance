"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ClassBadge,
  ProvenanceBadge,
  SnapshotBadge,
  StatusBadge,
} from "@/components/badges";
import { PageHeader } from "@/components/page-header";
import { Field, NodePriceCell } from "@/components/ui";
import { usePrices } from "@/context/prices";
import { useStore } from "@/context/store";
import { formatHoldingAmount, formatUsd, holdingToNumber } from "@/lib/format";
import { hasHoldings } from "@/lib/holdings-snapshot";
import type { AssetClass, Node, PositionStatus } from "@/lib/types";

const STATUSES: PositionStatus[] = ["none", "watch", "funded"];

function parseEditableAmount(raw: string): number | string | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return trimmed;
}

function HoldingsLine({ node }: { node: Node }) {
  if (!hasHoldings(node) && !node.venue) return null;
  const avg = holdingToNumber(node.averageCost);
  return (
    <p className="mt-2 text-sm text-[color:var(--muted)]">
      {hasHoldings(node) ? (
        <>
          <span className="font-mono tabular-nums">
            {formatHoldingAmount(node.quantity)}
          </span>
          {avg !== null ? <> @ {formatUsd(avg)} avg</> : null}
        </>
      ) : (
        "No quantity"
      )}
      {node.venue ? ` · ${node.venue}` : ""}
    </p>
  );
}

export default function NodesPage() {
  const { ready, epoch, state, updateNode } = useStore();
  const { book, quoteFor } = usePrices();
  const [filter, setFilter] = useState<"all" | AssetClass>("all");
  const [openTicker, setOpenTicker] = useState<string | null>("XRP");

  const nodes = useMemo(() => {
    return state.nodes.filter(
      (node) => filter === "all" || node.class === filter,
    );
  }, [filter, state.nodes]);

  if (!ready) {
    return <p className="text-sm text-[color:var(--muted)]">Loading nodes…</p>;
  }

  return (
    <div>
      <PageHeader
        kicker="Board"
        title="Nodes"
        description="Twelve tracking slots. Paste a Grok Bot / Robinhood JSON snapshot in Settings to fill quantity, average cost, and venue. Thesis and failure condition stay yours to edit. This is still not a live brokerage feed."
        actions={
          <div className="flex gap-2">
            <Link href="/settings" className="btn btn-secondary">
              Import snapshot
            </Link>
            {(["all", "digital", "physical"] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={`btn ${filter === item ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setFilter(item)}
              >
                {item === "all" ? "All" : item === "digital" ? "Digital" : "Physical"}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2 text-sm text-[color:var(--muted)]">
        <ProvenanceBadge value="unverified" />
        <span>
          Rewrite name, thesis, failure condition, status, last price, and any
          imported holding. Snapshot imports show as founder-reported and
          verified-from-snapshot.
        </span>
      </div>

      <div className="grid gap-4">
        {nodes.map((node) => {
          const live = quoteFor(node.ticker);
          const liveStatus =
            node.class === "digital" ? book.crypto.status : book.equities.status;
          const open = openTicker === node.ticker;
          const fromSnapshot = Boolean(node.syncSource && node.lastSyncedAt);
          return (
            <article key={node.ticker} className="card">
              <button
                type="button"
                className="flex w-full flex-col gap-4 text-left sm:flex-row sm:items-start sm:justify-between"
                onClick={() =>
                  setOpenTicker(open ? null : node.ticker)
                }
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-mono text-lg">{node.ticker}</h2>
                    <ClassBadge value={node.class} />
                    <StatusBadge value={node.status} />
                    {fromSnapshot ? (
                      <>
                        <ProvenanceBadge value="founder-reported" />
                        <SnapshotBadge />
                      </>
                    ) : hasHoldings(node) ? (
                      <ProvenanceBadge value="founder-reported" />
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">
                    {node.name}
                  </p>
                  <HoldingsLine node={node} />
                  {node.holdingsNote ? (
                    <p className="mt-1 text-xs text-[color:var(--muted)]">
                      {node.holdingsNote}
                    </p>
                  ) : null}
                </div>
                <NodePriceCell node={node} live={live} liveStatus={liveStatus} />
              </button>

              {open ? (
                <div
                  key={`${node.ticker}-${epoch}`}
                  className="mt-6 grid gap-4 border-t border-[color:var(--border)] pt-5 lg:grid-cols-2"
                >
                  <Field label="Display name">
                    <input
                      className="input"
                      value={node.name}
                      onChange={(event) =>
                        updateNode(node.ticker, { name: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Position status">
                    <select
                      className="select"
                      value={node.status}
                      onChange={(event) =>
                        updateNode(node.ticker, {
                          status: event.target.value as PositionStatus,
                        })
                      }
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Quantity"
                    hint="Fractional shares or units. Type over a snapshot at any time."
                  >
                    <input
                      className="input font-mono"
                      inputMode="decimal"
                      placeholder="Leave blank"
                      defaultValue={
                        node.quantity === null || node.quantity === undefined
                          ? ""
                          : String(node.quantity)
                      }
                      onBlur={(event) => {
                        const next = parseEditableAmount(event.target.value);
                        if (next === undefined) return;
                        updateNode(node.ticker, { quantity: next });
                      }}
                    />
                  </Field>
                  <Field
                    label="Average cost (USD)"
                    hint="Per-unit cost basis. Optional."
                  >
                    <input
                      className="input font-mono"
                      inputMode="decimal"
                      placeholder="Leave blank"
                      defaultValue={
                        node.averageCost === null ||
                        node.averageCost === undefined
                          ? ""
                          : String(node.averageCost)
                      }
                      onBlur={(event) => {
                        const next = parseEditableAmount(event.target.value);
                        if (next === undefined) return;
                        updateNode(node.ticker, { averageCost: next });
                      }}
                    />
                  </Field>
                  <Field
                    label="Venue"
                    hint="Robinhood, Xaman, Coinbase, MetaMask, or another custody label."
                  >
                    <input
                      className="input"
                      value={node.venue}
                      onChange={(event) =>
                        updateNode(node.ticker, { venue: event.target.value })
                      }
                      placeholder="e.g. Robinhood"
                    />
                  </Field>
                  <Field
                    label="Manual last price (USD)"
                    hint="Typed by you and stored locally. Shown when no live feed is available. Live prints never overwrite this field."
                  >
                    <input
                      className="input font-mono"
                      inputMode="decimal"
                      placeholder="Leave blank"
                      defaultValue={
                        node.manualPriceUsd === null
                          ? ""
                          : String(node.manualPriceUsd)
                      }
                      onBlur={(event) => {
                        const raw = event.target.value.trim();
                        if (!raw) {
                          updateNode(node.ticker, {
                            manualPriceUsd: null,
                            manualPriceUpdatedAt: null,
                          });
                          return;
                        }
                        const value = Number(raw);
                        if (!Number.isFinite(value) || value < 0) return;
                        updateNode(node.ticker, {
                          manualPriceUsd: value,
                          manualPriceUpdatedAt: new Date().toISOString(),
                        });
                      }}
                    />
                  </Field>
                  <Field label="Thesis (editable stub)">
                    <textarea
                      className="textarea"
                      value={node.thesis}
                      onChange={(event) =>
                        updateNode(node.ticker, {
                          thesis: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Failure condition (editable stub)">
                    <textarea
                      className="textarea"
                      value={node.failureCondition}
                      onChange={(event) =>
                        updateNode(node.ticker, {
                          failureCondition: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field
                    label="Holdings note"
                    hint="e.g. Robinhood XRP is separate from Xaman treasury."
                  >
                    <textarea
                      className="textarea"
                      value={node.holdingsNote}
                      onChange={(event) =>
                        updateNode(node.ticker, {
                          holdingsNote: event.target.value,
                        })
                      }
                    />
                  </Field>
                  {fromSnapshot ? (
                    <p className="text-xs text-[color:var(--muted)] lg:col-span-2">
                      Last snapshot {node.lastSyncedAt} via {node.syncSource}.
                      Still founder-reported / verified-from-snapshot — not a
                      live Robinhood session.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 line-clamp-2 text-sm text-[color:var(--muted)]">
                  {node.thesis}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
