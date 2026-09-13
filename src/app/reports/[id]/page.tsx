"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ReportAttestPanel } from "@/components/report-attest";
import {
  fetchDecisionsHealth,
  type HederaHealthSnapshot,
} from "@/lib/decisions-client-sync";
import {
  REPORT_KIND_LABEL,
  reportsArchiveHref,
} from "@/lib/reports-browser";
import {
  applyReportPatch,
  getReportsSyncSnapshot,
  getServerReportsSyncSnapshot,
  hydrateReportsFromServer,
  subscribeReportsSync,
} from "@/lib/reports-client-sync";

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id ?? "");
  const sync = useSyncExternalStore(
    subscribeReportsSync,
    getReportsSyncSnapshot,
    getServerReportsSyncSnapshot,
  );

  const [hedera, setHedera] = useState<HederaHealthSnapshot | null>(null);

  useEffect(() => {
    void hydrateReportsFromServer();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchDecisionsHealth().then((health) => {
      if (cancelled) return;
      if (health?.hedera) setHedera(health.hedera);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const item = sync.reports.find((row) => row.id === id) ?? null;
  const loading = sync.status === "idle" || sync.status === "checking";

  if (loading && !item) {
    return (
      <p className="text-sm text-[color:var(--muted)]">Loading report…</p>
    );
  }

  if (!item) {
    return (
      <div>
        <PageHeader
          kicker="OS · Binder"
          title="Report not found"
          description="That file is not in the shared binder."
        />
        <EmptyState
          title={`${id} is not here`}
          body="Go back to Reports, or unlock and pull the shared store if this device is behind."
          action={
            <Link href="/reports" className="btn btn-secondary">
              Back to Reports
            </Link>
          }
        />
      </div>
    );
  }

  const folderHref = reportsArchiveHref(item.createdAt);

  return (
    <div>
      <PageHeader
        kicker="OS · File"
        title={item.title}
        description={`${REPORT_KIND_LABEL[item.kind]} · ${item.id}`}
        actions={
          <Link href={folderHref} className="btn btn-secondary">
            Back to folder
          </Link>
        }
      />
      <p className="mb-6 text-sm text-[color:var(--muted)]">
        <Link href="/reports" className="text-[color:var(--accent)]">
          Reports
        </Link>
        {" / "}
        <Link href={folderHref} className="text-[color:var(--accent)]">
          {item.createdAt}
        </Link>
        {" / "}
        <span className="font-mono">{item.id}</span>
      </p>

      <article className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Meta label="Kind" value={REPORT_KIND_LABEL[item.kind]} />
          <Meta label="Chicago day" value={item.createdAt} mono />
          <Meta label="Filed" value={item.filedAt} mono />
          {item.blobPointer ? (
            <Meta label="Blob pointer" value={item.blobPointer} mono />
          ) : null}
        </div>
        <div>
          <p className="kicker mb-2">Body</p>
          <pre className="whitespace-pre-wrap font-mono text-sm leading-6 text-[color:var(--text)]">
            {item.body || "(body lives at the blob pointer)"}
          </pre>
        </div>
      </article>

      <section className="card mt-6 space-y-3">
        <p className="kicker">Attest</p>
        <h2 className="text-lg">Hedera Testnet fingerprint</h2>
        <p className="break-all font-mono text-xs text-[color:var(--text)]">
          {item.fingerprint}
        </p>
        <ReportAttestPanel
          item={item}
          hedera={hedera}
          onApplied={(report) => {
            applyReportPatch(report.id, report);
          }}
        />
      </section>
    </div>
  );
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="kicker">{label}</p>
      <p className={`mt-1 text-sm ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
