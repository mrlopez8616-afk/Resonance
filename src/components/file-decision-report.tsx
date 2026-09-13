"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { chicagoDayKey } from "@/lib/reports";
import { reportDetailHref } from "@/lib/reports-browser";
import { fileReportOnServer } from "@/lib/reports-client-sync";
import type { Decision } from "@/lib/types";

export function FileDecisionAsReport({ item }: { item: Decision }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const today = chicagoDayKey();

  async function file() {
    setBusy(true);
    setError(null);
    setNote(null);
    const result = await fileReportOnServer({
      fromDecisionId: item.id,
      dayKey: today,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNote(`Filed ${result.report.id} in the ${result.report.createdAt} folder.`);
    router.push(reportDetailHref(result.report.id));
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3">
      <p className="kicker">Reports binder</p>
      <h3 className="text-sm font-medium text-[color:var(--text)]">
        File from this Decision
      </h3>
      <p className="text-sm text-[color:var(--muted)]">
        Writes a brief into today&apos;s Chicago folder (
        <span className="font-mono">{today}</span>
        ). Same day + title updates the file instead of duplicating. Hub can
        also POST{" "}
        <span className="font-mono text-xs">
          {"{ fromDecisionId, dayKey }"}
        </span>{" "}
        to <span className="font-mono text-xs">/api/reports</span>.
      </p>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy}
        onClick={() => {
          void file();
        }}
      >
        {busy ? "Filing…" : "File from Decision"}
      </button>
      {error ? (
        <p className="text-sm text-[color:var(--danger)]">{error}</p>
      ) : null}
      {note ? (
        <p className="text-sm text-[color:var(--ok)]">{note}</p>
      ) : null}
    </div>
  );
}
