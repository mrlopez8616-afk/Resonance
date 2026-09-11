"use client";

import { useState } from "react";
import { DecisionStatusBadge } from "@/components/badges";
import { DecisionsImportPanel } from "@/components/decisions-import";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Field } from "@/components/ui";
import { useStore } from "@/context/store";
import { nextDecisionId, sortDecisions } from "@/lib/decisions";
import { todayIsoDate } from "@/lib/format";
import type { Decision, DecisionStatus } from "@/lib/types";

const STATUS_OPTIONS: DecisionStatus[] = ["pending", "decided", "superseded"];

function emptyDraft(date: string, id: string): Draft {
  return {
    id,
    date,
    question: "",
    options: "",
    status: "pending",
    decision: "",
    rationale: "",
    evidence: "",
    reviewTrigger: "",
  };
}

type Draft = Omit<Decision, "createdAt">;

export default function DecisionsPage() {
  const {
    ready,
    state,
    addDecision,
    updateDecision,
    deleteDecision,
    exportDecisionsJson,
  } = useStore();
  const [draft, setDraft] = useState<Draft>(() =>
    emptyDraft(todayIsoDate(), ""),
  );
  const [error, setError] = useState<string | null>(null);
  const [idTouched, setIdTouched] = useState(false);

  const rows = sortDecisions(state.decisions);
  const suggestedId = nextDecisionId(state.decisions, draft.date);
  const newId = idTouched && draft.id.trim() ? draft.id.trim() : suggestedId;

  function patchDraft(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.question.trim()) {
      setError("Write the question.");
      return;
    }
    if (
      (draft.status === "decided" || draft.status === "superseded") &&
      !draft.decision.trim()
    ) {
      setError("A decided or superseded row needs the founder decision.");
      return;
    }
    try {
      addDecision({
        id: newId,
        question: draft.question.trim(),
        options: draft.options.trim(),
        status: draft.status,
        decision: draft.decision.trim(),
        rationale: draft.rationale.trim(),
        evidence: draft.evidence.trim(),
        reviewTrigger: draft.reviewTrigger.trim(),
        date: draft.date || todayIsoDate(),
      });
      setDraft(emptyDraft(todayIsoDate(), ""));
      setIdTouched(false);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not add this record.",
      );
    }
  }

  function downloadExport() {
    const blob = new Blob([exportDecisionsJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "resonance-decisions.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!ready) {
    return (
      <p className="text-sm text-[color:var(--muted)]">Loading record book…</p>
    );
  }

  return (
    <div>
      <PageHeader
        kicker="Record Book"
        title="Decisions"
        description="Phase Zero durable log for Andres López. Hub records structured entries; import/merge keeps chat and this site aligned. On-chain / XRS recording is later — Web2 only. Nothing here executes or signs."
        actions={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={downloadExport}
          >
            Export decisions JSON
          </button>
        }
      />

      <div className="notice notice-warn mb-8">
        <p className="font-medium text-[color:var(--text)]">
          This is the OS record book. Each row is a dated ID with the question,
          options, founder decision, rationale, evidence, review trigger, and
          status.
        </p>
        <p className="mt-2">
          Merge from hub JSON by decision ID. Unrelated local entries are not
          wiped. Blockchain recording is out of scope for Phase Zero.
        </p>
      </div>

      <DecisionsImportPanel />

      <form className="card mb-8 grid gap-4 lg:grid-cols-2" onSubmit={submit}>
        <div className="lg:col-span-2">
          <h2 className="text-lg">New record</h2>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            IDs default to D-YYYY-MM-DD-NN. Use the same ID the hub used if you
            are typing a chat lock by hand.
          </p>
        </div>
        <Field label="Record ID">
          <input
            className="input font-mono"
            value={idTouched ? draft.id : suggestedId}
            onChange={(event) => {
              setIdTouched(true);
              patchDraft({ id: event.target.value });
            }}
            placeholder="D-2026-09-11-05"
          />
        </Field>
        <Field label="Date">
          <input
            className="input"
            type="date"
            value={draft.date}
            onChange={(event) => patchDraft({ date: event.target.value })}
          />
        </Field>
        <div className="lg:col-span-2">
          <Field label="Question">
            <input
              className="input"
              value={draft.question}
              onChange={(event) => patchDraft({ question: event.target.value })}
              placeholder="What has to be decided?"
            />
          </Field>
        </div>
        <Field label="Options">
          <input
            className="input"
            value={draft.options}
            onChange={(event) => patchDraft({ options: event.target.value })}
            placeholder="A · B · C"
          />
        </Field>
        <Field label="Status">
          <select
            className="select"
            value={draft.status}
            onChange={(event) =>
              patchDraft({ status: event.target.value as DecisionStatus })
            }
          >
            {STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value === "pending"
                  ? "Pending"
                  : value === "decided"
                    ? "Decided"
                    : "Superseded"}
              </option>
            ))}
          </select>
        </Field>
        <div className="lg:col-span-2">
          <Field label="Founder decision">
            <textarea
              className="textarea"
              value={draft.decision}
              onChange={(event) => patchDraft({ decision: event.target.value })}
              placeholder="The call."
            />
          </Field>
        </div>
        <Field label="Rationale">
          <textarea
            className="textarea"
            value={draft.rationale}
            onChange={(event) => patchDraft({ rationale: event.target.value })}
            placeholder="Why this call."
          />
        </Field>
        <Field label="Evidence">
          <textarea
            className="textarea"
            value={draft.evidence}
            onChange={(event) => patchDraft({ evidence: event.target.value })}
            placeholder="What was on the table."
          />
        </Field>
        <div className="lg:col-span-2">
          <Field label="Review trigger">
            <input
              className="input"
              value={draft.reviewTrigger}
              onChange={(event) =>
                patchDraft({ reviewTrigger: event.target.value })
              }
              placeholder="What would reopen this record."
            />
          </Field>
        </div>
        {error ? (
          <p className="text-sm text-[color:var(--danger)]">{error}</p>
        ) : null}
        <div>
          <button className="btn btn-primary" type="submit">
            Add to record book
          </button>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="Record book is empty"
          body="Add a row or import/merge the locked 09-11 example so the board has a next action."
        />
      ) : (
        <div className="space-y-4">
          {rows.map((item) => (
            <DecisionCard
              key={item.id}
              item={item}
              onUpdate={updateDecision}
              onDelete={deleteDecision}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DecisionCard({
  item,
  onUpdate,
  onDelete,
}: {
  item: Decision;
  onUpdate: (id: string, patch: Partial<Decision>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <article className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="kicker">{item.date || "undated"}</p>
          <span className="badge border-[color:var(--border)] font-mono text-[color:var(--text)]">
            {item.id}
          </span>
          <DecisionStatusBadge value={item.status} />
        </div>
        <select
          className="select w-auto"
          value={item.status}
          onChange={(event) =>
            onUpdate(item.id, {
              status: event.target.value as DecisionStatus,
            })
          }
        >
          {STATUS_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value === "pending"
                ? "Pending"
                : value === "decided"
                  ? "Decided"
                  : "Superseded"}
            </option>
          ))}
        </select>
      </div>
      <Field label="Question">
        <input
          className="input"
          value={item.question}
          onChange={(event) =>
            onUpdate(item.id, { question: event.target.value })
          }
        />
      </Field>
      <Field label="Options">
        <input
          className="input"
          value={item.options}
          onChange={(event) =>
            onUpdate(item.id, { options: event.target.value })
          }
        />
      </Field>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Date">
          <input
            className="input"
            type="date"
            value={item.date}
            onChange={(event) =>
              onUpdate(item.id, { date: event.target.value })
            }
          />
        </Field>
        <Field label="Record ID" hint="Durable merge key. Edit via import/merge if the hub used a different ID.">
          <input
            className="input font-mono"
            value={item.id}
            readOnly
          />
        </Field>
      </div>
      <Field label="Founder decision">
        <textarea
          className="textarea"
          value={item.decision}
          onChange={(event) =>
            onUpdate(item.id, { decision: event.target.value })
          }
        />
      </Field>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Rationale">
          <textarea
            className="textarea"
            value={item.rationale}
            onChange={(event) =>
              onUpdate(item.id, { rationale: event.target.value })
            }
          />
        </Field>
        <Field label="Evidence">
          <textarea
            className="textarea"
            value={item.evidence}
            onChange={(event) =>
              onUpdate(item.id, { evidence: event.target.value })
            }
          />
        </Field>
      </div>
      <Field label="Review trigger">
        <input
          className="input"
          value={item.reviewTrigger}
          onChange={(event) =>
            onUpdate(item.id, { reviewTrigger: event.target.value })
          }
        />
      </Field>
      <button
        type="button"
        className="btn btn-danger"
        onClick={() => onDelete(item.id)}
      >
        Delete
      </button>
    </article>
  );
}
