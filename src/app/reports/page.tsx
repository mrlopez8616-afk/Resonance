"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { FileReportForm } from "@/components/file-report-form";
import { PageHeader } from "@/components/page-header";
import { ReportsArchiveBrowser } from "@/components/reports-archive";
import {
  getReportsSyncSnapshot,
  getServerReportsSyncSnapshot,
  hydrateReportsFromServer,
  subscribeReportsSync,
} from "@/lib/reports-client-sync";

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-[color:var(--muted)]">Loading binder…</p>
      }
    >
      <ReportsPageInner />
    </Suspense>
  );
}

function ReportsPageInner() {
  const searchParams = useSearchParams();
  const folderKey = searchParams.get("folder");
  const sync = useSyncExternalStore(
    subscribeReportsSync,
    getReportsSyncSnapshot,
    getServerReportsSyncSnapshot,
  );

  useEffect(() => {
    void hydrateReportsFromServer();
  }, []);

  const statusLine =
    sync.status === "idle" || sync.status === "checking"
      ? "Checking the shared binder…"
      : sync.status === "synced"
        ? `Live on all unlocked devices (${sync.backend}).`
        : sync.status === "local"
          ? sync.reason
          : sync.message;

  return (
    <div>
      <PageHeader
        kicker="OS · Binder"
        title="Reports"
        description="Digital binder for briefs and reports the OS files. Folders are America/Chicago days. Open a day, then a file. Attest writes a Hedera Testnet fingerprint (not the body). Printer is later."
      />

      <p className="mb-6 text-sm text-[color:var(--muted)]">{statusLine}</p>

      <ReportsArchiveBrowser reports={sync.reports} folderKey={folderKey} />

      {!folderKey ? (
        <div className="mt-8">
          <FileReportForm />
        </div>
      ) : null}

      <div className="notice notice-warn mt-8">
        <p className="font-medium text-[color:var(--text)]">
          Toolbox, not a node. Same Blob family as Decisions and todos
          (resonance/reports.json). Hub Bearer-files{" "}
          <span className="font-mono">POST /api/reports</span> with{" "}
          <span className="font-mono">RESONANCE_SYNC_SECRET</span>. Same
          day + title merges. Contract:{" "}
          <span className="font-mono">docs/reports-autofile.md</span>.
        </p>
      </div>
    </div>
  );
}
