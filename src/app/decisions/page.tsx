"use client";

import { useState } from "react";
import { DecisionStatusBadge } from "@/components/badges";
import { DecisionsImportPanel } from "@/components/decisions-import";
import { DecisionsSyncBanner } from "@/components/decisions-sync";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Field } from "@/components/ui";
import { useStore } from "@/context/store";
import { nextDecisionId, sortDecisions } from "@/lib/decisions";
import { todayIsoDate } from "@/lib/format";
import type { Decision, DecisionStatus } from "@/lib/types";

const STATUS_OPTIONS: DecisionStatus[] = ["pending", "decided", "superseded"];

function emptyDraft(date: string, id: string, authorizedBy = ""): Draft {
  return {
    id,
    date,
    question: "",
    proposal: "",
    options: "",
    status: "pending",
    decision: "",
    rationale: "",
    authorizedBy,
    outcome: "",
    evidence: "",
    reviewTrigger: "",
    fingerprint: null,
    attestationStatus: "web2_only",
    hederaMessageId: null,
    attestedAt: null,
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
  const operatorName = state.settings.operatorName;
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
        proposal: draft.proposal.trim(),
        options: draft.options.trim(),
        status: draft.status,
        decision: draft.decision.trim(),
        rationale: draft.rationale.trim(),
        authorizedBy: draft.authorizedBy.trim() || operatorName,
        outcome: draft.outcome.trim(),
        evidence: draft.evidence.trim(),
        reviewTrigger: draft.reviewTrigger.trim(),
        fingerprint: null,
        attestationStatus: "web2_only",
        hederaMessageId: null,
        attestedAt: null,
        date: draft.date || todayIsoDate(),
      });
      setDraft(emptyDraft(todayIsoDate(), "", operatorName));
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
        description="Phase Zero durable log for Andres López. Each row records what was proposed, why, who authorized, the call, what actually happened (queued ≠ filled), and a receipt. Shared store + hub PATCH merge by ID. On-chain fingerprint comes later — Web2 only."
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
          proposal, options, founder decision, why, who authorized, outcome,
          receipt, review trigger, and status.
        </p>
        <p className="mt-2">
          Hub can POST/PATCH /api/decisions (queued → filled) and this page
          pulls the shared store. JSON import remains a fallback. Blockchain
          recording is out of scope for Phase Zero.
        </p>
      </div>

      <DecisionsSyncBanner />

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
        <div className="lg:col-span-2">
          <Field label="Proposal" hint="The specific action on the table. Distinct from the founder call and from the outcome.">
            <input
              className="input"
              value={draft.proposal}
              onChange={(event) => patchDraft({ proposal: event.target.value })}
              placeholder="What was proposed?"
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
        <Field label="Who authorized">
          <input
            className="input"
            value={draft.authorizedBy}
            onChange={(event) =>
              patchDraft({ authorizedBy: event.target.value })
            }
            placeholder={operatorName || "Andres López"}
          />
        </Field>
        <div className="lg:col-span-2">
          <Field label="Founder decision">
            <textarea
              className="textarea"
              value={draft.decision}
              onChange={(event) => patchDraft({ decision: event.target.value })}
              placeholder="The call — not the fill."
            />
          </Field>
        </div>
        <Field label="Why">
          <textarea
            className="textarea"
            value={draft.rationale}
            onChange={(event) => patchDraft({ rationale: event.target.value })}
            placeholder="Why this call."
          />
        </Field>
        <Field
          label="Outcome"
          hint="What actually happened. A queued or approved order is not a fill."
        >
          <textarea
            className="textarea"
            value={draft.outcome}
            onChange={(event) => patchDraft({ outcome: event.target.value })}
            placeholder="Queued ≠ filled."
          />
        </Field>
        <Field label="Evidence / receipt">
          <textarea
            className="textarea"
            value={draft.evidence}
            onChange={(event) => patchDraft({ evidence: event.target.value })}
            placeholder="Order ids, quotes, links, screenshot refs."
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
          <span className="badge border-[color:var(--border)] font-mono text-[color:var(--muted)]">
            fingerprint {item.fingerprint ?? "null"}
          </span>
          <span className="badge border-[color:var(--border)] text-[color:var(--muted)]">
            {item.attestationStatus.replace(/_/g, " ")}
          </span>
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
      <Field label="Proposal">
        <input
          className="input"
          value={item.proposal}
          onChange={(event) =>
            onUpdate(item.id, { proposal: event.target.value })
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
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Who authorized">
          <input
            className="input"
            value={item.authorizedBy}
            onChange={(event) =>
              onUpdate(item.id, { authorizedBy: event.target.value })
            }
          />
        </Field>
        <Field label="Founder decision">
          <textarea
            className="textarea"
            value={item.decision}
            onChange={(event) =>
              onUpdate(item.id, { decision: event.target.value })
            }
          />
        </Field>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Why">
          <textarea
            className="textarea"
            value={item.rationale}
            onChange={(event) =>
              onUpdate(item.id, { rationale: event.target.value })
            }
          />
        </Field>
        <Field
          label="Outcome"
          hint="What actually happened. Queued ≠ filled."
        >
          <textarea
            className="textarea"
            value={item.outcome}
            onChange={(event) =>
              onUpdate(item.id, { outcome: event.target.value })
            }
          />
        </Field>
      </div>
      <Field label="Evidence / receipt">
        <textarea
          className="textarea"
          value={item.evidence}
          onChange={(event) =>
            onUpdate(item.id, { evidence: event.target.value })
          }
        />
      </Field>
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
