"use client";

import { useState } from "react";
import {
  mirrorDecisionOnXrplServer,
  type XrplHealthSnapshot,
} from "@/lib/decisions-client-sync";
import type { Decision } from "@/lib/types";
import { xrplExplorerUrl } from "@/lib/xrpl-explorer";

function canMirror(item: Decision): boolean {
  return (
    item.attestationStatus === "hashgraph_attested" &&
    Boolean(item.hederaMessageId) &&
    Boolean(item.fingerprint)
  );
}

export function DecisionXrplMirrorPanel({
  item,
  xrpl,
  onApplied,
}: {
  item: Decision;
  xrpl: XrplHealthSnapshot | null;
  onApplied: (id: string, patch: Partial<Decision>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const healthKnown = xrpl !== null;
  const configured = xrpl?.configured === true;
  const eligible = canMirror(item);
  const explorer = xrplExplorerUrl(xrpl?.network ?? "testnet", item.xrplTxHash);
  const alreadyMirrored = Boolean(item.xrplTxHash);

  async function mirror() {
    setBusy(true);
    setError(null);
    setNote(null);
    const result = await mirrorDecisionOnXrplServer(item.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onApplied(item.id, {
      xrplTxHash: result.decision.xrplTxHash,
      xrplMemoAt: result.decision.xrplMemoAt,
    });
    setNote("XRPL Testnet pointer written to the shared Decision store.");
  }

  return (
    <div className="space-y-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-[color:var(--muted)]">
        XRPL Testnet mirror
      </p>
      {item.xrplTxHash ? (
        <p className="text-sm text-[color:var(--muted)]">
          XRPL tx{" "}
          {explorer ? (
            <a
              href={explorer}
              className="font-mono text-[color:var(--accent)]"
              target="_blank"
              rel="noreferrer"
            >
              {item.xrplTxHash}
            </a>
          ) : (
            <span className="font-mono">{item.xrplTxHash}</span>
          )}
          {item.xrplMemoAt ? ` · ${item.xrplMemoAt}` : ""}
        </p>
      ) : (
        <p className="text-sm text-[color:var(--muted)]">
          Payment-rail pointer only. Writes an AccountSet with R1 memo
          (id + Hedera message + fingerprint prefix). Fee only — no
          transfer. Not the Xaman principal wallet.
        </p>
      )}
      {!eligible ? (
        <p className="text-sm text-[color:var(--muted)]">
          Mirror on XRPL Testnet after Hedera attest writes a message id and
          fingerprint.
        </p>
      ) : !healthKnown ? (
        <p className="text-sm text-[color:var(--muted)]">
          Checking XRPL Testnet configuration…
        </p>
      ) : !configured ? (
        <p className="text-sm text-[color:var(--muted)]">
          XRPL Testnet submit is off until you set{" "}
          <span className="font-mono text-xs">XRPL_SEED</span> on Vercel
          (server-only — never paste that seed into chat). Then redeploy. Hub
          can still POST{" "}
          <span className="font-mono text-xs">{"{ id, xrplTxHash }"}</span> to
          record a testnet.xrpl.org hash by hand.
        </p>
      ) : null}
      {eligible ? (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || !configured}
          onClick={() => {
            void mirror();
          }}
        >
          {busy
            ? "Mirroring…"
            : alreadyMirrored
              ? "Re-mirror on XRPL Testnet"
              : "Mirror on XRPL Testnet"}
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
