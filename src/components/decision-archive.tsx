"use client";

import Link from "next/link";
import { ChevronRight, FileText, Folder } from "lucide-react";
import { DecisionStatusBadge } from "@/components/badges";
import { EmptyState } from "@/components/page-header";
import {
  archiveStatusLabel,
  decisionDetailHref,
  decisionsArchiveHref,
  findDateFolder,
  folderSummary,
  groupDecisionsByDate,
  type DecisionArchiveStatus,
} from "@/lib/decision-browser";
import type { Decision } from "@/lib/types";

export function DecisionArchiveBrowser({
  decisions,
  folderKey,
}: {
  decisions: Decision[];
  folderKey: string | null;
}) {
  if (decisions.length === 0) {
    return (
      <EmptyState
        title="Archive is empty"
        body="Add a record or import/merge the locked 09-11 example so the board has a next action."
      />
    );
  }

  if (folderKey) {
    const folder = findDateFolder(decisions, folderKey);
    if (!folder) {
      return (
        <div className="space-y-4">
          <ArchiveBackLink />
          <EmptyState
            title="Folder not found"
            body="That date folder has no records. Go back to the archive."
          />
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <ArchiveBackLink />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="kicker">Folder</p>
            <h2 className="mt-1 font-mono text-xl">{folder.label}</h2>
            <p className="mt-1 text-sm text-[color:var(--muted)]">
              {folder.count} file{folder.count === 1 ? "" : "s"} ·{" "}
              {folderSummary(folder)}
            </p>
          </div>
        </div>
        <div className="space-y-5">
          {folder.groups.map((group) => (
            <section key={group.status}>
              <p className="kicker mb-2">{group.label}</p>
              <div className="overflow-hidden rounded-xl border border-[color:var(--border)]">
                {group.items.map((item) => (
                  <DecisionFileRow
                    key={item.id}
                    item={item}
                    archiveStatus={group.status}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    );
  }

  const folders = groupDecisionsByDate(decisions);
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg">Archive</h2>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Folders are dates. Open one to see the decision files, then click a
          file to read the full record.
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-[color:var(--border)]">
        {folders.map((folder) => (
          <Link
            key={folder.key}
            href={decisionsArchiveHref(folder.key)}
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
                {folderSummary(folder)}
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

function DecisionFileRow({
  item,
  archiveStatus,
}: {
  item: Decision;
  archiveStatus: DecisionArchiveStatus;
}) {
  return (
    <Link href={decisionDetailHref(item.id)} className="file-row">
      <FileText
        size={18}
        strokeWidth={1.6}
        className="shrink-0 text-[color:var(--accent-2)]"
      />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm text-[color:var(--text)]">{item.id}</p>
        <p className="mt-0.5 truncate text-sm text-[color:var(--muted)]">
          {item.question || "Untitled record"}
        </p>
      </div>
      {archiveStatus === "attested" ? (
        <span className="badge border-[color:var(--accent-2)]/40 bg-[color:var(--accent-2)]/10 text-[color:var(--accent-2)]">
          {archiveStatusLabel("attested")}
        </span>
      ) : (
        <DecisionStatusBadge value={item.status} />
      )}
      <ChevronRight
        size={16}
        className="shrink-0 text-[color:var(--muted)]"
      />
    </Link>
  );
}

function ArchiveBackLink() {
  return (
    <Link href={decisionsArchiveHref()} className="text-sm text-[color:var(--accent)]">
      ← Archive
    </Link>
  );
}
