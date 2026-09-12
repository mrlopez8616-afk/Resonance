"use client";

import { useRef, useState } from "react";
import { Field } from "@/components/ui";
import { useStore } from "@/context/store";
import { formatTimestamp, formatUnits } from "@/lib/format";
import {
  TREASURY_IMPORT_HELP,
  TreasuryLedgerImportError,
  parseTreasuryLedgerImport,
  previewLedgerMerge,
  type LedgerMergePreview,
} from "@/lib/treasury-ledger";

const EXAMPLE_URL = "/examples/treasury-ledger.json";

export function TreasuryImportPanel() {
  const { state, importTreasuryLedgerMerge } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<LedgerMergePreview | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loadingExample, setLoadingExample] = useState(false);

  function runPreview(raw: string) {
    try {
      const imported = parseTreasuryLedgerImport(raw);
      setPreview(
        previewLedgerMerge(
          state.ledger,
          imported.ledger,
          state.treasury.units,
          imported.treasury?.units ?? null,
        ),
      );
      setAsOf(imported.asOf);
      setSource(imported.source);
      setError(null);
      setMessage(null);
    } catch (caught) {
      setPreview(null);
      setAsOf(null);
      setSource(null);
      setError(
        caught instanceof TreasuryLedgerImportError
          ? caught.message
          : "Could not parse this treasury ledger JSON.",
      );
    }
  }

  function handlePreview(event: React.FormEvent) {
    event.preventDefault();
    runPreview(text);
  }

  function handleApply() {
    try {
      const imported = parseTreasuryLedgerImport(text);
      const summary = previewLedgerMerge(
        state.ledger,
        imported.ledger,
        state.treasury.units,
        imported.treasury?.units ?? null,
      );
      importTreasuryLedgerMerge(imported.ledger, imported.treasury);
      setPreview(null);
      setError(null);
      setMessage(
        `Merged ${imported.ledger.length} ledger row${
          imported.ledger.length === 1 ? "" : "s"
        } by ID · ${summary.added} added · ${summary.updated} updated · ${
          summary.untouchedLocal
        } local row${summary.untouchedLocal === 1 ? "" : "s"} left alone${
          imported.treasury?.units != null
            ? ` · working balance set to ${formatUnits(imported.treasury.units)}`
            : ""
        }.`,
      );
    } catch (caught) {
      setError(
        caught instanceof TreasuryLedgerImportError
          ? caught.message
          : "Merge failed.",
      );
    }
  }

  async function loadExample() {
    setLoadingExample(true);
    setError(null);
    try {
      const response = await fetch(EXAMPLE_URL);
      if (!response.ok) {
        throw new Error("Example treasury file was not found.");
      }
      const body = await response.text();
      setText(body.trim());
      runPreview(body);
    } catch {
      setError("Could not load the example from /examples.");
    } finally {
      setLoadingExample(false);
    }
  }

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const body = typeof reader.result === "string" ? reader.result : "";
      setText(body.trim());
      runPreview(body);
    };
    reader.onerror = () => {
      setError("Could not read that file.");
    };
    reader.readAsText(file);
  }

  return (
    <section className="card mb-8 space-y-4">
      <h2 className="text-lg">Import / merge treasury trail</h2>
      <p className="text-sm text-[color:var(--muted)]">
        Paste or pick the founder-reported Aug 28 → 27,772 trail. Matching{" "}
        <span className="font-mono">id</span> values update in place. Unrelated
        local rows stay. Optional <span className="font-mono">treasury.units</span>{" "}
        overwrites the working balance and stays founder-reported.
      </p>

      {message ? (
        <p className="text-sm text-[color:var(--accent)]">{message}</p>
      ) : null}

      <details className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] p-4">
        <summary className="cursor-pointer text-sm text-[color:var(--text)]">
          Treasury ledger JSON schema
        </summary>
        <pre className="mt-3 overflow-x-auto text-xs leading-5 text-[color:var(--muted)]">
          {TREASURY_IMPORT_HELP}
        </pre>
      </details>

      <form className="space-y-3" onSubmit={handlePreview}>
        <Field
          label="Paste treasury ledger JSON"
          hint="Example lives at /examples/treasury-ledger.json"
        >
          <textarea
            className="textarea min-h-40 font-mono text-xs"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setPreview(null);
              setMessage(null);
            }}
            spellCheck={false}
            placeholder='{"asOf":"...","source":"founder-reported","treasury":{"units":27772},"ledger":[...]}'
          />
        </Field>
        {error ? (
          <p className="text-sm text-[color:var(--danger)]">{error}</p>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={handleFile}
        />
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary" type="submit">
            Preview merge
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            Pick JSON file
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void loadExample()}
            disabled={loadingExample}
          >
            {loadingExample ? "Loading example…" : "Load Aug 28 → 27,772 example"}
          </button>
        </div>
      </form>

      {preview ? (
        <div className="space-y-3">
          <p className="text-sm text-[color:var(--muted)]">
            {source ?? "treasury JSON"}
            {asOf ? ` · as of ${formatTimestamp(asOf)}` : ""} · {preview.added}{" "}
            add · {preview.updated} update · {preview.unchanged} already match ·{" "}
            {preview.untouchedLocal} local untouched
            {preview.nextUnits != null
              ? ` · next working balance ${formatUnits(preview.nextUnits)}`
              : ""}
            . Review, then merge.
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Action</th>
                  <th>Date</th>
                  <th>Class</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-xs">{row.id}</td>
                    <td>
                      {row.action === "add"
                        ? "Add"
                        : row.action === "update"
                          ? "Update"
                          : "Unchanged"}
                    </td>
                    <td className="font-mono text-xs">{row.date}</td>
                    <td>{row.classification}</td>
                    <td className="font-mono tabular-nums">
                      {formatUnits(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleApply}
            disabled={
              preview.added === 0 &&
              preview.updated === 0 &&
              !preview.appliesTreasury
            }
          >
            Merge by ID
          </button>
        </div>
      ) : null}
    </section>
  );
}
