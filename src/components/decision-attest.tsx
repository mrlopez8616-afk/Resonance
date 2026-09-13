"use client";

import { useState } from "react";
import { AttestationStatusBadge } from "@/components/badges";
import { attestDecisionOnServer, type HederaHealthSnapshot } from "@/lib/decisions-client-sync";
import { hederaExplorerUrl } from "@/lib/hedera-explorer";
import type { Decision } from "@/lib/types";

function canAttest(item: Decision): boolean {
  return (
    (item.status === "decided" || item.status === "superseded") &&
    item.attestationStatus !== "pending_operator_ack"
  );
}

export function DecisionAttestPanel({
  item,
  hedera,
  onApplied,
}: {
  item: Decision;
  hedera: HederaHealthSnapshot | null;
  onApplied: (id: string, patch: Partial<Decision>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const healthKnown = hedera !== null;
  const configured = hedera?.configured === true;
  const eligible = canAttest(item);
  const explorer =
    hederaExplorerUrl(hedera?.network ?? "testnet", item.hederaMessageId);
  const alreadyAttested = item.attestationStatus === "hashgraph_attested";

  async function attest() {
    setBusy(true);
    setError(null);
    setNote(null);
    const result = await attestDecisionOnServer(item.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onApplied(item.id, {
      fingerprint: result.decision.fingerprint,
      attestationStatus: result.decision.attestationStatus,
      hederaMessageId: result.decision.hederaMessageId,
      attestedAt: result.decision.attestedAt,
    });
    setNote(result.note ?? "Witness ids written to the shared Decision store.");
  }

  return (
    <div className="space-y-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <AttestationStatusBadge value={item.attestationStatus} />
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
      {item.attestationStatus === "pending_operator_ack" ? (
        <p className="text-sm text-[color:var(--muted)]">
          Sensor / raw events stay off Hedera until an operator views and acks
          them.
        </p>
      ) : !eligible ? (
        <p className="text-sm text-[color:var(--muted)]">
          Attest is for decided or superseded chain-class rows.
        </p>
      ) : !healthKnown ? (
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
          to record a HashScan id by hand.
        </p>
      ) : null}
      {eligible ? (
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
      ) : null}
      {error ? (
        <p className="text-sm text-[color:var(--danger)]">{error}</p>
      ) : null}
      {note ? (
        <p className="text-sm text-[color:var(--ok)]">{note}</p>
      ) : null}
    </div>
  );
}
