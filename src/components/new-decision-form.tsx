"use client";

import { useState } from "react";
import { Field } from "@/components/ui";
import { useStore } from "@/context/store";
import { nextDecisionId } from "@/lib/decisions";
import { todayIsoDate } from "@/lib/format";
import type { Decision, DecisionStatus } from "@/lib/types";

const STATUS_OPTIONS: DecisionStatus[] = ["pending", "decided", "superseded"];

type Draft = Omit<Decision, "createdAt">;

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

export function NewDecisionForm() {
  const { state, addDecision } = useStore();
  const operatorName = state.settings.operatorName;
  const [draft, setDraft] = useState<Draft>(() =>
    emptyDraft(todayIsoDate(), ""),
  );
  const [error, setError] = useState<string | null>(null);
  const [idTouched, setIdTouched] = useState(false);

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

  return (
    <form className="card mb-2 grid gap-4 lg:grid-cols-2" onSubmit={submit}>
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
        <Field
          label="Proposal"
          hint="The specific action on the table. Distinct from the founder call and from the outcome."
        >
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
  );
}
