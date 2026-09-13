"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";

interface HealthPayload {
  ok?: boolean;
  service?: string;
  note?: string;
  gate?: { enabled?: boolean };
  decisionsSync?: {
    configured?: boolean;
    backend?: string;
    writeProtection?: string;
    recordCount?: number;
    updatedAt?: string | null;
    seeded?: boolean;
  };
  todosSync?: {
    configured?: boolean;
    backend?: string;
    itemCount?: number;
    updatedAt?: string | null;
  };
  hedera?: {
    configured?: boolean;
    network?: string;
    operatorId?: string;
    topicId?: string | null;
  };
  xrpl?: {
    configured?: boolean;
    network?: string;
    account?: string;
  };
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
      .then((body: HealthPayload) => {
        if (!cancelled) setHealth(body);
      })
      .catch(() => {
        if (!cancelled) setError("Could not read /api/health.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader
        kicker="OS"
        title="System health"
        description="Counts and configured flags only. Never keys, seeds, decision text, or to-do text. This is the same public /api/health payload the hub already uses."
        actions={
          <Link href="/api/health" className="btn btn-secondary">
            Raw JSON
          </Link>
        }
      />

      {error ? (
        <p className="text-sm text-[color:var(--danger)]">{error}</p>
      ) : !health ? (
        <p className="text-sm text-[color:var(--muted)]">Reading health…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <HealthCard
            kicker="Gate"
            title={health.gate?.enabled ? "Password gate on" : "Password gate off"}
            body="Site lock. Production should be on. Local/dev may be off."
          />
          <HealthCard
            kicker="Decisions sync"
            title={health.decisionsSync?.configured ? "Blob / file store ready" : "Local only"}
            body={`${health.decisionsSync?.backend ?? "unknown"} · ${health.decisionsSync?.recordCount ?? 0} records · write ${health.decisionsSync?.writeProtection ?? "—"}`}
          />
          <HealthCard
            kicker="Todos sync"
            title={`${health.todosSync?.itemCount ?? 0} items`}
            body={`${health.todosSync?.backend ?? "unknown"} · counts only`}
          />
          <HealthCard
            kicker="Hedera Testnet"
            title={health.hedera?.configured ? "Attest configured" : "Key unset"}
            body={`${health.hedera?.network ?? "testnet"} · ${health.hedera?.operatorId ?? "—"} · topic ${health.hedera?.topicId ?? "none"}`}
          />
          <HealthCard
            kicker="XRPL Testnet"
            title={health.xrpl?.configured ? "Mirror configured" : "Seed unset"}
            body={`${health.xrpl?.network ?? "testnet"} · ${health.xrpl?.account ?? "—"}`}
          />
        </div>
      )}

      <p className="mt-8 text-sm text-[color:var(--muted)]">
        Health never includes operator keys, XRPL seeds, dollar sizes, or
        private receipts. Attest and mirror stay on Decisions.
      </p>
    </div>
  );
}

function HealthCard({
  kicker,
  title,
  body,
}: {
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <article className="card">
      <p className="kicker">{kicker}</p>
      <h2 className="mt-2 text-lg">{title}</h2>
      <p className="mt-2 text-sm text-[color:var(--muted)]">{body}</p>
    </article>
  );
}
