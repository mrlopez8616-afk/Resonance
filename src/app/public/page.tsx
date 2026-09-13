"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClassBadge } from "@/components/badges";
import { PageHeader } from "@/components/page-header";
import { useStore } from "@/context/store";
import { digitalNodes, physicalNodes } from "@/lib/robinhood";
import { hederaExplorerUrl } from "@/lib/hedera-explorer";
import { xrplExplorerUrl } from "@/lib/xrpl-explorer";
import {
  publishedAllocationSum,
  toPublicSkeleton,
  type PublicDecision,
} from "@/lib/public-view";

export default function PublicSkeletonPage() {
  const { ready, state } = useStore();
  const skeleton = toPublicSkeleton(state);
  const digital = digitalNodes(state.nodes);
  const physical = physicalNodes(state.nodes);
  const published = publishedAllocationSum(skeleton.nodes);
  const [serverDecisions, setServerDecisions] = useState<PublicDecision[] | null>(
    null,
  );
  const publicDecisions = serverDecisions ?? skeleton.decisions;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { decisions?: PublicDecision[] } | null) => {
        if (cancelled || !Array.isArray(body?.decisions)) return;
        setServerDecisions(body.decisions);
      })
      .catch(() => {
        /* keep redacted local skeleton */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <p className="text-sm text-[color:var(--muted)]">Loading public skeleton…</p>
    );
  }

  return (
    <div>
      <PageHeader
        kicker="Shareable"
        title="Public skeleton"
        description="Twelve nodes as target allocation percentages of the published system — not dollars. Dry powder / exact XRP / Robinhood sizes stay on the gated private board. Hedera Testnet message ids and XRPL Testnet tx hashes appear when a row is dual-witnessed — never private prices in public memos."
      />

      <div className="notice notice-warn mb-8">
        This route is the shareable surface. It omits founder treasury units, RH
        account ties, cash, and receipts. Edit target % on Nodes. Unpublished
        stays unpublished (—).
      </div>

      <p className="mb-6 text-sm text-[color:var(--muted)]">
        Published allocation sum: {published === 0 ? "none published yet" : `${published}%`}
        {" · "}
        <Link href="/" className="text-[color:var(--accent)]">
          Private board
        </Link>
      </p>

      <section className="mb-8">
        <p className="kicker mb-3">Physical AI</p>
        <AllocationTable nodes={physical} />
      </section>
      <section className="mb-8">
        <p className="kicker mb-3">Digital</p>
        <AllocationTable nodes={digital} />
      </section>

      <section>
        <h2 className="mb-3 text-lg">Public decision index</h2>
        <p className="mb-3 text-sm text-[color:var(--muted)]">
          Question + attestation status only. No sized outcomes. Hedera message
          id and XRPL Testnet tx hash appear here when those pointers exist.
        </p>
        <div className="space-y-2">
          {publicDecisions
            .filter((row) => row.id.startsWith("D-"))
            .map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2"
              >
                <div>
                  <p className="font-mono text-xs">{row.id}</p>
                  <p className="mt-1 text-sm">{row.question}</p>
                  <p className="mt-1 text-xs text-[color:var(--muted)]">
                    Memo hash {row.memoHash ?? "—"} · {row.memoAt ?? "not attested"}
                    {row.hederaMessageId ? (
                      <>
                        {" · "}
                        <a
                          href={
                            hederaExplorerUrl("testnet", row.hederaMessageId) ??
                            undefined
                          }
                          className="font-mono text-[color:var(--accent)]"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {row.hederaMessageId}
                        </a>
                      </>
                    ) : null}
                    {row.xrplTxHash ? (
                      <>
                        {" · "}
                        <a
                          href={
                            xrplExplorerUrl("testnet", row.xrplTxHash) ??
                            undefined
                          }
                          className="font-mono text-[color:var(--accent)]"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {row.xrplTxHash.slice(0, 12)}…
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <p className="text-xs uppercase tracking-[0.12em] text-[color:var(--muted)]">
                  {row.attestationStatus.replace(/_/g, " ")}
                </p>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}

function AllocationTable({
  nodes,
}: {
  nodes: ReturnType<typeof physicalNodes>;
}) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Node</th>
            <th>Class</th>
            <th>Target %</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr key={node.ticker}>
              <td>
                <span className="font-mono">{node.ticker}</span>
                <span className="ml-2 text-[color:var(--muted)]">{node.name}</span>
              </td>
              <td>
                <ClassBadge value={node.class} />
              </td>
              <td className="font-mono tabular-nums">
                {node.publicAllocationPct === null
                  ? "—"
                  : `${node.publicAllocationPct}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
