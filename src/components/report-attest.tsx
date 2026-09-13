"use client";

import { useState } from "react";
import { ReportAttestationBadge } from "@/components/badges";
import type { HederaHealthSnapshot } from "@/lib/decisions-client-sync";
import { hederaExplorerUrl } from "@/lib/hedera-explorer";
import {
  isReportAttested,
  type OperatorReport,
} from "@/lib/reports";
import { attestReportOnServer } from "@/lib/reports-client-sync";

export function ReportAttestPanel({
  item,
  hedera,
  onApplied,
}: {
  item: OperatorReport;
  hedera: HederaHealthSnapshot | null;
  onApplied: (report: OperatorReport) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const healthKnown = hedera !== null;
  const configured = hedera?.configured === true;
  const alreadyAttested = isReportAttested(item);
  const explorer =
    item.attestLink ||
    hederaExplorerUrl(hedera?.network ?? "testnet", item.hederaMessageId);

  async function attest() {
    setBusy(true);
    setError(null);
    setNote(null);
    const result = await attestReportOnServer(item.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onApplied(result.report);
    setNote(result.note ?? "Witness ids written to the shared reports binder.");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ReportAttestationBadge value={item.attestationStatus} />
        <span className="font-mono text-xs text-[color:var(--muted)]">
          fingerprint {item.fingerprint ? `${item.fingerprint.slice(0, 12)}…` : "null"}
        </span>
      </div>
      {item.hederaMessageId ? (
        <p className="text-sm text-[color:var(--muted)]">
          Hedera message{" "}
          {explorer ? (
            <a
              href={explorer}
              className="font-mono text-[color:var(--accent)]"
              target="_blank"
              rel="noreferrer"
            >
              {item.hederaMessageId}
            </a>
          ) : (
            <span className="font-mono">{item.hederaMessageId}</span>
          )}
          {item.attestedAt ? ` · ${item.attestedAt}` : ""}
        </p>
      ) : null}
      {!healthKnown ? (
        <p className="text-sm text-[color:var(--muted)]">
          Checking Hedera Testnet configuration…
        </p>
      ) : !configured && alreadyAttested ? (
        <p className="text-sm text-[color:var(--muted)]">
          Live re-attest needs{" "}
          <span className="font-mono text-xs">HEDERA_OPERATOR_KEY</span> on
          Vercel (server-only — never paste that key into chat).
        </p>
      ) : !configured ? (
        <p className="text-sm text-[color:var(--muted)]">
          Hedera Testnet submit is off until you set{" "}
          <span className="font-mono text-xs">HEDERA_OPERATOR_KEY</span> on
          Vercel (server-only — never paste that key into chat). Then redeploy.
          Hub can still POST{" "}
          <span className="font-mono text-xs">
            {"{ id, hederaMessageId }"}
          </span>{" "}
          to <span className="font-mono text-xs">/api/attest</span> to record a
          HashScan id by hand.
        </p>
      ) : (
        <p className="text-sm text-[color:var(--muted)]">
          Cheap fingerprint only — the SHA-256 goes to Hedera Testnet HCS, not
          the report body. Same path as Decisions attest. No Mainnet.
        </p>
      )}
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy || !configured}
        onClick={() => {
          void attest();
        }}
      >
        {busy
          ? "Attesting…"
          : alreadyAttested
            ? "Re-attest (Hedera Testnet)"
            : "Attest (Hedera Testnet)"}
      </button>
      {error ? (
        <p className="text-sm text-[color:var(--danger)]">{error}</p>
      ) : null}
      {note ? (
        <p className="text-sm text-[color:var(--ok)]">{note}</p>
      ) : null}
    </div>
  );
}
