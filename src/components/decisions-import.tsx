"use client";

import { useRef, useState } from "react";
import { DecisionStatusBadge } from "@/components/badges";
import { Field } from "@/components/ui";
import { useStore } from "@/context/store";
import {
  DECISIONS_IMPORT_HELP,
  DecisionsImportError,
  parseDecisionsImport,
  previewDecisionsMerge,
  type DecisionsMergePreview,
} from "@/lib/decisions";
import { formatTimestamp } from "@/lib/format";

const EXAMPLE_URL = "/examples/decisions-record-book.json";

export function DecisionsImportPanel() {
  const { state, importDecisionsMerge } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<DecisionsMergePreview | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loadingExample, setLoadingExample] = useState(false);

  function runPreview(raw: string) {
    try {
      const imported = parseDecisionsImport(raw);
      setPreview(previewDecisionsMerge(state.decisions, imported.decisions));
      setAsOf(imported.asOf);
      setSource(imported.source);
      setError(null);
      setMessage(null);
    } catch (caught) {
      setPreview(null);
      setAsOf(null);
      setSource(null);
      setError(
        caught instanceof DecisionsImportError
          ? caught.message
          : "Could not parse this decisions JSON.",
      );
    }
  }

  function handlePreview(event: React.FormEvent) {
    event.preventDefault();
    runPreview(text);
  }

  function handleApply() {
    try {
      const imported = parseDecisionsImport(text);
      const summary = previewDecisionsMerge(state.decisions, imported.decisions);
      importDecisionsMerge(imported.decisions);
      setPreview(null);
      setError(null);
      setMessage(
        `Merged ${imported.decisions.length} record${
          imported.decisions.length === 1 ? "" : "s"
        } by ID · ${summary.added} added · ${summary.updated} updated · ${
          summary.untouchedLocal
        } local row${summary.untouchedLocal === 1 ? "" : "s"} left alone.`,
      );
    } catch (caught) {
      setError(
        caught instanceof DecisionsImportError
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
        throw new Error("Example decisions file was not found.");
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
      <h2 className="text-lg">Import / merge from JSON</h2>
      <p className="text-sm text-[color:var(--muted)]">
        Hub (Resonance Operations) and chat lock structured entries. Paste or
        pick a JSON file. Matching <span className="font-mono">id</span> values
        update in place. Unrelated local rows stay. This does not replace
        treasury, nodes, or the full snapshot — use Settings for that.
      </p>

      {message ? (
        <p className="text-sm text-[color:var(--accent)]">{message}</p>
      ) : null}

      <details className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] p-4">
        <summary className="cursor-pointer text-sm text-[color:var(--text)]">
          Decisions JSON schema
        </summary>
        <p className="mt-3 text-sm text-[color:var(--muted)]">
          Merge key is <span className="font-mono">id</span>. Required story:
          proposal, why, who authorized, outcome (queued ≠ filled), receipt.
          <span className="font-mono"> fingerprint</span> is filled when a row
          is attested on Hedera Testnet.
          A bare array of records is also accepted. Status: pending · decided ·
          superseded.
        </p>
        <pre className="mt-3 overflow-x-auto text-xs leading-5 text-[color:var(--muted)]">
          {DECISIONS_IMPORT_HELP}
        </pre>
      </details>

      <form className="space-y-3" onSubmit={handlePreview}>
        <Field
          label="Paste decisions JSON"
          hint="Example lives at /examples/decisions-record-book.json"
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
            placeholder='{"asOf":"...","source":"resonance-hub","decisions":[...]}'
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
            {loadingExample ? "Loading example…" : "Load locked 09-11 example"}
          </button>
        </div>
      </form>

      {preview ? (
        <div className="space-y-3">
          <p className="text-sm text-[color:var(--muted)]">
            {source ?? "decisions JSON"}
            {asOf ? ` · as of ${formatTimestamp(asOf)}` : ""} · {preview.added}{" "}
            add · {preview.updated} update · {preview.unchanged} already match ·{" "}
            {preview.untouchedLocal} local untouched. Review, then merge.
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Action</th>
                  <th>Question</th>
                  <th>Status</th>
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
                    <td>{row.question}</td>
                    <td>
                      <DecisionStatusBadge value={row.status} />
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
            disabled={preview.added === 0 && preview.updated === 0}
          >
            Merge by ID
          </button>
        </div>
      ) : null}
    </section>
  );
}
