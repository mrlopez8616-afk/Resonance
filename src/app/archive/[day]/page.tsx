"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { FileReportForm } from "@/components/file-report-form";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ReportsArchiveBrowser } from "@/components/reports-archive";
import { isIsoDayKey } from "@/lib/reports";
import {
  getReportsSyncSnapshot,
  getServerReportsSyncSnapshot,
  hydrateReportsFromServer,
  subscribeReportsSync,
} from "@/lib/reports-client-sync";

export default function ArchiveDayPage() {
  const params = useParams<{ day: string }>();
  const day = decodeURIComponent(params.day ?? "");
  const sync = useSyncExternalStore(
    subscribeReportsSync,
    getReportsSyncSnapshot,
    getServerReportsSyncSnapshot,
  );

  useEffect(() => {
    void hydrateReportsFromServer();
  }, []);

  if (!isIsoDayKey(day)) {
    return (
      <div>
        <PageHeader
          kicker="OS · Binder"
          title="Invalid day"
          description="Archive folders are YYYY-MM-DD in America/Chicago."
        />
        <EmptyState
          title={`${day || "—"} is not a day key`}
          body="Use /archive/2026-09-13 or open Reports and pick a folder."
        />
      </div>
    );
  }

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
        title={day}
        description="Filed reports for this Chicago day. Open a file to read the body and fingerprint."
      />
      <p className="mb-6 text-sm text-[color:var(--muted)]">{statusLine}</p>
      <ReportsArchiveBrowser reports={sync.reports} folderKey={day} />
      <div className="mt-8">
        <FileReportForm defaultDay={day} />
      </div>
    </div>
  );
}
