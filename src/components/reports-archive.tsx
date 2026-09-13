"use client";

import Link from "next/link";
import { ChevronRight, FileText, Folder } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import {
  findReportDateFolder,
  folderFileSummary,
  groupReportsByDate,
  reportDetailHref,
  REPORT_KIND_LABEL,
  reportsArchiveHref,
} from "@/lib/reports-browser";
import type { OperatorReport } from "@/lib/reports";

export function ReportsArchiveBrowser({
  reports,
  folderKey,
}: {
  reports: OperatorReport[];
  folderKey: string | null;
}) {
  if (reports.length === 0) {
    return (
      <EmptyState
        title="Binder is empty"
        body="File today's brief below, or wait for the seed stub to land on first boot."
      />
    );
  }

  if (folderKey) {
    const folder = findReportDateFolder(reports, folderKey);
    if (!folder) {
      return (
        <div className="space-y-4">
          <ArchiveBackLink />
          <EmptyState
            title="Folder not found"
            body="That Chicago day has no filed reports. Go back to the binder."
          />
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <ArchiveBackLink />
        <div>
          <p className="kicker">Folder</p>
          <h2 className="mt-1 font-mono text-xl">{folder.label}</h2>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            {folder.count} file{folder.count === 1 ? "" : "s"} ·{" "}
            {folderFileSummary(folder)}
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-[color:var(--border)]">
          {folder.items.map((item) => (
            <ReportFileRow key={item.id} item={item} />
          ))}
        </div>
      </div>
    );
  }

  const folders = groupReportsByDate(reports);
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg">Archive</h2>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Folders are Chicago days. Open one to see the filed reports, then
          click a file to read the record and its fingerprint.
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-[color:var(--border)]">
        {folders.map((folder) => (
          <Link
            key={folder.key}
            href={reportsArchiveHref(folder.key)}
            className="file-row"
          >
            <Folder
              size={18}
              strokeWidth={1.6}
              className="shrink-0 text-[color:var(--accent)]"
            />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm text-[color:var(--text)]">
                {folder.label}
              </p>
              <p className="mt-0.5 truncate text-xs text-[color:var(--muted)]">
                {folderFileSummary(folder)}
              </p>
            </div>
            <span className="font-mono text-xs text-[color:var(--muted)]">
              {folder.count}
            </span>
            <ChevronRight
              size={16}
              className="shrink-0 text-[color:var(--muted)]"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}

function ReportFileRow({ item }: { item: OperatorReport }) {
  return (
    <Link href={reportDetailHref(item.id)} className="file-row">
      <FileText
        size={18}
        strokeWidth={1.6}
        className="shrink-0 text-[color:var(--accent-2)]"
      />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm text-[color:var(--text)]">{item.id}</p>
        <p className="mt-0.5 truncate text-sm text-[color:var(--muted)]">
          {item.title}
        </p>
      </div>
      <span className="badge border-[color:var(--border)] bg-[color:var(--surface-2)] text-[color:var(--muted)]">
        {REPORT_KIND_LABEL[item.kind]}
      </span>
      <ChevronRight size={16} className="shrink-0 text-[color:var(--muted)]" />
    </Link>
  );
}

function ArchiveBackLink() {
  return (
    <Link href={reportsArchiveHref()} className="text-sm text-[color:var(--accent)]">
      ← Reports
    </Link>
  );
}
