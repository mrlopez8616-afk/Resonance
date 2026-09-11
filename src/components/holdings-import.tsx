"use client";

import { useState } from "react";
import { ProvenanceBadge, SnapshotBadge, StatusBadge } from "@/components/badges";
import { Field } from "@/components/ui";
import { useStore } from "@/context/store";
import {
  formatHoldingAmount,
  formatTimestamp,
  formatUsd,
  holdingToNumber,
} from "@/lib/format";
import {
  HOLDINGS_SNAPSHOT_HELP,
  HoldingsSnapshotError,
  parseHoldingsSnapshot,
  previewHoldingsSnapshot,
  type HoldingsPreview,
} from "@/lib/holdings-snapshot";

const EXAMPLE_URL = "/examples/robinhood-holdings-snapshot.json";

export function HoldingsImportPanel({
  onApplied,
}: {
  onApplied?: (message: string) => void;
}) {
  const { state, importHoldingsSnapshot } = useStore();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<HoldingsPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingExample, setLoadingExample] = useState(false);

  function runPreview(raw: string) {
    try {
      const snapshot = parseHoldingsSnapshot(raw);
      setPreview(previewHoldingsSnapshot(state, snapshot));
      setError(null);
    } catch (caught) {
      setPreview(null);
      setError(
        caught instanceof HoldingsSnapshotError
          ? caught.message
          : "Could not parse this snapshot.",
      );
    }
  }

  function handlePreview(event: React.FormEvent) {
    event.preventDefault();
    runPreview(text);
  }

  function handleApply() {
    try {
      const snapshot = parseHoldingsSnapshot(text);
      const summary = previewHoldingsSnapshot(state, snapshot);
      importHoldingsSnapshot(snapshot);
      setPreview(null);
      setError(null);
      const message = `Imported ${summary.matchedNodeCount} node holding${
        summary.matchedNodeCount === 1 ? "" : "s"
      } from ${summary.syncSource} (as of ${formatTimestamp(summary.asOf)}). Not a live Robinhood link.`;
      onApplied?.(message);
    } catch (caught) {
      setError(
        caught instanceof HoldingsSnapshotError
          ? caught.message
          : "Import failed.",
      );
    }
  }

  async function loadExample() {
    setLoadingExample(true);
    setError(null);
    try {
      const response = await fetch(EXAMPLE_URL);
      if (!response.ok) {
        throw new Error("Example snapshot was not found.");
      }
      const body = await response.text();
      setText(body.trim());
      runPreview(body);
    } catch {
      setError("Could not load the example snapshot from /examples.");
    } finally {
      setLoadingExample(false);
    }
  }

  return (
    <section className="card mb-8 space-y-4">
      <h2 className="text-lg">Import holdings snapshot</h2>
      <p className="text-sm text-[color:var(--muted)]">
        Resonance does not log into Robinhood. Grok Bot pulls the founder
        account and writes a JSON snapshot. Paste it here (or load the seeded
        example). Matching board tickers become <strong>funded</strong> with
        quantity, average cost, and venue. You can type over any field after
        import.
      </p>

      <div className="notice notice-warn">
        <p className="font-medium text-[color:var(--text)]">
          Pasted snapshot — not a live continuous Robinhood link. No OAuth. No
          auto-trade.
        </p>
        <p className="mt-2">
          Robinhood XRP (~69) is a separate bag from the Xaman treasury
          (~26k). Importing XRP from a Robinhood snapshot updates the XRP{" "}
          <em>node holding</em> with venue Robinhood. It does not overwrite
          treasury principal unless a holding explicitly sets{" "}
          <code className="font-mono text-xs">target: &quot;treasury&quot;</code>
          .
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ProvenanceBadge value="founder-reported" />
        <SnapshotBadge />
        <span className="text-xs text-[color:var(--muted)]">
          Imports are badged this way. They are not a verified live feed.
        </span>
      </div>

      <details className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] p-4">
        <summary className="cursor-pointer text-sm text-[color:var(--text)]">
          Snapshot JSON schema
        </summary>
        <p className="mt-3 text-sm text-[color:var(--muted)]">
          Case-insensitive ticker match against the twelve board nodes. Optional
          fields: averageCost, venue, note, assetClass, target.
        </p>
        <pre className="mt-3 overflow-x-auto text-xs leading-5 text-[color:var(--muted)]">
          {HOLDINGS_SNAPSHOT_HELP}
        </pre>
      </details>

      <form className="space-y-3" onSubmit={handlePreview}>
        <Field
          label="Paste holdings JSON"
          hint="Example lives at /examples/robinhood-holdings-snapshot.json"
        >
          <textarea
            className="textarea min-h-40 font-mono text-xs"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setPreview(null);
            }}
            spellCheck={false}
            placeholder='{"asOf":"...","source":"robinhood","holdings":[...]}'
          />
        </Field>
        {error ? (
          <p className="text-sm text-[color:var(--danger)]">{error}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary" type="submit">
            Preview
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void loadExample()}
            disabled={loadingExample}
          >
            {loadingExample ? "Loading example…" : "Load example snapshot"}
          </button>
        </div>
      </form>

      {preview ? (
        <div className="space-y-3">
          <p className="text-sm text-[color:var(--muted)]">
            {preview.syncSource} · as of {formatTimestamp(preview.asOf)} ·{" "}
            {preview.matchedNodeCount} node
            {preview.matchedNodeCount === 1 ? "" : "s"} will update
            {preview.unmatchedCount
              ? ` · ${preview.unmatchedCount} unmatched skipped`
              : ""}
            {preview.treasuryUpdates
              ? ` · ${preview.treasuryUpdates} treasury update`
              : ""}
            . Review, then apply.
          </p>
          {preview.warnings.map((warning) => (
            <p key={warning} className="text-sm text-[color:var(--accent)]">
              {warning}
            </p>
          ))}
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Match</th>
                  <th>Qty</th>
                  <th>Avg cost</th>
                  <th>Venue</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, index) => (
                  <tr key={`${row.symbol}-${index}`}>
                    <td className="font-mono">{row.symbol}</td>
                    <td>
                      {row.action === "unmatched"
                        ? "Skipped"
                        : row.action === "update-treasury"
                          ? "Treasury"
                          : row.nodeName}
                      {row.warnings.length ? (
                        <p className="mt-1 text-xs text-[color:var(--muted)]">
                          {row.warnings.join(" ")}
                        </p>
                      ) : null}
                    </td>
                    <td className="font-mono tabular-nums">
                      {formatHoldingAmount(row.quantity)}
                    </td>
                    <td className="font-mono tabular-nums">
                      {formatUsd(holdingToNumber(row.averageCost))}
                    </td>
                    <td>{row.venue || "—"}</td>
                    <td>
                      {row.nextStatus ? (
                        <span className="flex flex-wrap items-center gap-2">
                          {row.currentStatus ? (
                            <StatusBadge value={row.currentStatus} />
                          ) : null}
                          <span className="text-xs text-[color:var(--muted)]">
                            →
                          </span>
                          <StatusBadge value={row.nextStatus} />
                        </span>
                      ) : (
                        <span className="text-[color:var(--muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleApply}
            disabled={
              preview.matchedNodeCount === 0 && preview.treasuryUpdates === 0
            }
          >
            Apply snapshot
          </button>
        </div>
      ) : null}
    </section>
  );
}
