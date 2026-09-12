"use client";

import { useSyncExternalStore } from "react";
import { mergeDecisionsFromServer } from "@/lib/app-store";
import {
  getDecisionsSyncSnapshot,
  getServerDecisionsSyncSnapshot,
  hydrateDecisionsFromServer,
  subscribeDecisionsSync,
} from "@/lib/decisions-client-sync";

export function DecisionsSyncBanner() {
  const sync = useSyncExternalStore(
    subscribeDecisionsSync,
    getDecisionsSyncSnapshot,
    getServerDecisionsSyncSnapshot,
  );

  return (
    <div className="notice mb-8">
      <p className="font-medium text-[color:var(--text)]">Shared Decision store</p>
      <p className="mt-2 text-sm text-[color:var(--muted)]">
        {sync.status === "idle" || sync.status === "checking"
          ? "Checking the shared store…"
          : sync.status === "synced"
            ? `Live on all unlocked devices (${sync.backend}, ${sync.count} records). Hub can PATCH a fill — no JSON import.`
            : sync.status === "local"
              ? sync.reason
              : sync.message}
      </p>
      <button
        type="button"
        className="btn btn-secondary mt-3"
        onClick={() => {
          void hydrateDecisionsFromServer(mergeDecisionsFromServer);
        }}
      >
        Pull from server
      </button>
    </div>
  );
}

export function DecisionsSyncSettingsCard() {
  const sync = useSyncExternalStore(
    subscribeDecisionsSync,
    getDecisionsSyncSnapshot,
    getServerDecisionsSyncSnapshot,
  );

  return (
    <section className="card mb-8 space-y-3">
      <h2 className="text-lg">Decision sync</h2>
      <p className="text-sm text-[color:var(--muted)]">
        Shared store so Monday Agentic fills (and later RH events) write once
        and show on every device. localStorage stays the offline cache.
      </p>
      <p className="text-sm text-[color:var(--muted)]">
        {sync.status === "synced"
          ? `Connected · backend ${sync.backend} · ${sync.count} records${
              sync.updatedAt ? ` · ${sync.updatedAt}` : ""
            }`
          : sync.status === "local"
            ? sync.reason
            : sync.status === "error"
              ? sync.message
              : "Checking…"}
      </p>
      <p className="text-sm text-[color:var(--muted)]">
        Founder setup: Vercel → Storage → Blob → connect this project →
        redeploy. Optional <span className="font-mono text-xs">RESONANCE_SYNC_SECRET</span> for
        hub curl. Details:{" "}
        <span className="font-mono text-xs">docs/decision-sync.md</span>.
      </p>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          void hydrateDecisionsFromServer(mergeDecisionsFromServer);
        }}
      >
        Pull decisions now
      </button>
    </section>
  );
}
