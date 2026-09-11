"use client";

import { RefreshCw } from "lucide-react";
import { ClassBadge, ProvenanceBadge } from "@/components/badges";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ChangeChip } from "@/components/ui";
import { usePrices } from "@/context/prices";
import { useStore } from "@/context/store";
import { formatUsd } from "@/lib/format";
import { CRYPTO_TICKERS, EQUITY_TICKERS } from "@/lib/price-ids";

export default function PricesPage() {
  const { ready, state } = useStore();
  const { book, refresh, quoteFor } = usePrices();
  const cryptoLoading = book.crypto.status === "loading";
  const equityLoading = book.equities.status === "loading";

  if (!ready) {
    return <p className="text-sm text-[color:var(--muted)]">Loading prices…</p>;
  }

  return (
    <div>
      <PageHeader
        kicker="Market"
        title="Prices"
        description="Live prints are optional. The books stay useful if every feed is down: type a last price on Nodes. Failed fetches stay blank — nothing is invented."
        actions={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void refresh({ showLoading: true })}
            disabled={cryptoLoading || equityLoading}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        }
      />

      <p className="mb-8 text-sm text-[color:var(--muted)]">
        Last fetch: {book.fetchedAt ? book.fetchedAt.replace("T", " ").slice(0, 19) : "not yet"} UTC
      </p>

      <section className="mb-10">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-lg">Digital</h2>
          {book.crypto.status === "ok" ? (
            <ProvenanceBadge value="verified" />
          ) : (
            <ProvenanceBadge value="unverified" />
          )}
          <span className="text-sm text-[color:var(--muted)]">
            {book.crypto.source
              ? `Source: ${book.crypto.source}`
              : "No live crypto source"}
          </span>
        </div>
        {book.crypto.status === "error" ? (
          <div className="notice notice-warn mb-4">
            Crypto feed failed. {book.crypto.error} No fallback numbers were
            invented. Type a last price on Nodes if you need a working figure.
          </div>
        ) : null}
        <QuoteTable
          tickers={[...CRYPTO_TICKERS]}
          assetClass="digital"
          quoteFor={quoteFor}
          loading={book.crypto.status === "loading" || book.crypto.status === "idle"}
          failed={book.crypto.status === "error"}
          nodes={state.nodes}
        />
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-lg">Physical (US equities)</h2>
          {book.equities.status === "ok" ? (
            <ProvenanceBadge value="verified" />
          ) : (
            <ProvenanceBadge value="unverified" />
          )}
          <span className="text-sm text-[color:var(--muted)]">
            {book.equities.source
              ? `Source: ${book.equities.source}`
              : "No live equity source"}
          </span>
        </div>
        {book.equities.status === "error" ? (
          <div className="notice notice-warn mb-4">
            No live equity feed. {book.equities.error} Enter a manual last price
            on the Nodes board. Do not treat a blank as zero.
          </div>
        ) : null}
        <QuoteTable
          tickers={[...EQUITY_TICKERS]}
          assetClass="physical"
          quoteFor={quoteFor}
          loading={
            book.equities.status === "loading" || book.equities.status === "idle"
          }
          failed={book.equities.status === "error"}
          nodes={state.nodes}
        />
        {book.crypto.status === "error" || book.equities.status === "error" ? (
          <EmptyState
            title="Manual entry is the honest fallback"
            body="Open Nodes, expand a ticker, and type a last price. It is stored locally and labeled unverified. The rest of the board does not wait on this feed."
          />
        ) : null}
      </section>
    </div>
  );
}

function QuoteTable({
  tickers,
  assetClass,
  quoteFor,
  loading,
  failed,
  nodes,
}: {
  tickers: string[];
  assetClass: "digital" | "physical";
  quoteFor: (ticker: string) => { usd: number; change24hPct: number | null } | null;
  loading: boolean;
  failed: boolean;
  nodes: { ticker: string; name: string; manualPriceUsd: number | null }[];
}) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Name</th>
            <th>Class</th>
            <th>Last</th>
            <th>24h</th>
            <th>Provenance</th>
          </tr>
        </thead>
        <tbody>
          {tickers.map((ticker) => {
            const node = nodes.find((item) => item.ticker === ticker);
            const live = quoteFor(ticker);
            const manual = node?.manualPriceUsd ?? null;
            return (
              <tr key={ticker}>
                <td className="font-mono">{ticker}</td>
                <td>{node?.name ?? ticker}</td>
                <td>
                  <ClassBadge value={assetClass} />
                </td>
                <td className="font-mono tabular-nums">
                  {live
                    ? formatUsd(live.usd)
                    : manual !== null
                      ? formatUsd(manual)
                      : loading
                        ? "Fetching…"
                        : "—"}
                </td>
                <td>
                  {live ? (
                    <ChangeChip value={live.change24hPct} />
                  ) : (
                    <span className="text-[color:var(--muted)]">—</span>
                  )}
                </td>
                <td>
                  {live ? (
                    <ProvenanceBadge value="verified" />
                  ) : manual !== null ? (
                    <ProvenanceBadge value="unverified" />
                  ) : failed ? (
                    <span className="text-sm text-[color:var(--muted)]">
                      No live feed
                    </span>
                  ) : (
                    <span className="text-sm text-[color:var(--muted)]">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
