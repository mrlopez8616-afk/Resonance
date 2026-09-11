"use client";

import { useMemo, useState } from "react";
import { ClassBadge, ProvenanceBadge, StatusBadge } from "@/components/badges";
import { PageHeader } from "@/components/page-header";
import { Field, NodePriceCell } from "@/components/ui";
import { usePrices } from "@/context/prices";
import { useStore } from "@/context/store";
import type { AssetClass, PositionStatus } from "@/lib/types";

const STATUSES: PositionStatus[] = ["none", "watch", "funded"];

export default function NodesPage() {
  const { ready, state, updateNode } = useStore();
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
        description="Twelve tracking slots — not proof of holdings. Digital names are crypto tickers. Physical names are US equity tickers. Thesis, failure condition, status, and a manual last price are typed by you and stored in this browser. Live prints are optional."
        actions={
          <div className="flex gap-2">
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
        <span>Thesis and failure conditions are operator stubs until you rewrite them.</span>
      </div>

      <div className="grid gap-4">
        {nodes.map((node) => {
          const live = quoteFor(node.ticker);
          const liveStatus =
            node.class === "digital" ? book.crypto.status : book.equities.status;
          const open = openTicker === node.ticker;
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
                  </div>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">
                    {node.name}
                  </p>
                </div>
                <NodePriceCell node={node} live={live} liveStatus={liveStatus} />
              </button>

              {open ? (
                <div className="mt-6 grid gap-4 border-t border-[color:var(--border)] pt-5 lg:grid-cols-2">
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
