"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui";
import { chicagoDayKey, REPORT_KINDS, type ReportKind } from "@/lib/reports";
import { reportDetailHref } from "@/lib/reports-browser";
import { fileReportOnServer } from "@/lib/reports-client-sync";

const KIND_OPTIONS: Array<{ id: ReportKind; label: string }> = [
  { id: "brief", label: "Brief" },
  { id: "rh-ops", label: "RH ops" },
  { id: "build", label: "Build" },
  { id: "other", label: "Other" },
];

export function FileReportForm({
  defaultDay,
}: {
  defaultDay?: string;
}) {
  const router = useRouter();
  const today = defaultDay && /^\d{4}-\d{2}-\d{2}$/.test(defaultDay)
    ? defaultDay
    : chicagoDayKey();
  const [title, setTitle] = useState("Daily Resonance Brief");
  const [kind, setKind] = useState<ReportKind>("brief");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Write a title.");
      return;
    }
    if (!body.trim()) {
      setError("Paste the brief or report body.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await fileReportOnServer({
      title: title.trim(),
      kind,
      body: body.trim(),
      createdAt: today,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setBody("");
    router.push(reportDetailHref(result.report.id));
    router.refresh();
  }

  return (
    <form className="card space-y-4" onSubmit={(event) => void submit(event)}>
      <div>
        <h2 className="text-lg">File today&apos;s brief</h2>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Paste a Daily Resonance Brief (or another report). It lands in the{" "}
          <span className="font-mono">{today}</span> Chicago folder. Auto-file
          from every routine is later.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title">
          <input
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Daily Resonance Brief"
          />
        </Field>
        <Field label="Kind">
          <select
            className="input"
            value={kind}
            onChange={(event) => setKind(event.target.value as ReportKind)}
          >
            {KIND_OPTIONS.filter((option) =>
              REPORT_KINDS.includes(option.id),
            ).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Body">
        <textarea
          className="input min-h-40"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Paste the brief. This stays on the private binder — not the public skeleton."
        />
      </Field>
      {error ? (
        <p className="text-sm text-[color:var(--danger)]">{error}</p>
      ) : null}
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Filing…" : "File into binder"}
        </button>
      </div>
    </form>
  );
}
