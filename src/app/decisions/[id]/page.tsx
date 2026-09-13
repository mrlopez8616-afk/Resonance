"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DecisionRecordEditor } from "@/components/decision-record";
import { EmptyState, PageHeader } from "@/components/page-header";
import { useStore } from "@/context/store";
import {
  decisionFolderKey,
  decisionsArchiveHref,
} from "@/lib/decision-browser";

export default function DecisionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { ready, state, updateDecision, deleteDecision } = useStore();
  const id = decodeURIComponent(params.id ?? "");
  const item = state.decisions.find((row) => row.id === id) ?? null;

  if (!ready) {
    return (
      <p className="text-sm text-[color:var(--muted)]">Loading record…</p>
    );
  }

  if (!item) {
    return (
      <div>
        <PageHeader
          kicker="Record Book"
          title="Decision not found"
          description="That file is not in this browser’s record book."
        />
        <EmptyState
          title={`${id} is not here`}
          body="Go back to the archive, or pull the shared store if this device is behind."
          action={
            <Link href="/decisions" className="btn btn-secondary">
              Back to archive
            </Link>
          }
        />
      </div>
    );
  }

  const folderHref = decisionsArchiveHref(decisionFolderKey(item));

  return (
    <div>
      <PageHeader
        kicker="Record Book · File"
        title={item.id}
        description={item.question || "Untitled record"}
        actions={
          <Link href={folderHref} className="btn btn-secondary">
            Back to folder
          </Link>
        }
      />
      <p className="mb-6 text-sm text-[color:var(--muted)]">
        <Link href="/decisions" className="text-[color:var(--accent)]">
          Archive
        </Link>
        {" / "}
        <Link href={folderHref} className="text-[color:var(--accent)]">
          {decisionFolderKey(item)}
        </Link>
        {" / "}
        <span className="font-mono">{item.id}</span>
      </p>
      <DecisionRecordEditor
        item={item}
        onUpdate={updateDecision}
        onDelete={(recordId) => {
          deleteDecision(recordId);
          router.push(folderHref);
        }}
      />
    </div>
  );
}
