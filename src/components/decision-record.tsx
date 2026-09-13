"use client";

import { useEffect, useState } from "react";
import { DecisionAttestPanel } from "@/components/decision-attest";
import { DecisionStatusBadge } from "@/components/badges";
import { Field } from "@/components/ui";
import {
  fetchDecisionsHealth,
  type HederaHealthSnapshot,
} from "@/lib/decisions-client-sync";
import type { Decision, DecisionStatus } from "@/lib/types";

const STATUS_OPTIONS: DecisionStatus[] = ["pending", "decided", "superseded"];

export function DecisionRecordEditor({
  item,
  onUpdate,
  onDelete,
  showDelete = true,
}: {
  item: Decision;
  onUpdate: (id: string, patch: Partial<Decision>) => void;
  onDelete?: (id: string) => void;
  showDelete?: boolean;
}) {
  const [hedera, setHedera] = useState<HederaHealthSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchDecisionsHealth().then((health) => {
      if (cancelled || !health?.hedera) return;
      setHedera(health.hedera);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
          {item.attestedAt ? (
            <span className="badge border-[color:var(--border)] text-[color:var(--muted)]">
              attested {item.attestedAt}
            </span>
          ) : null}
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
        <Field
          label="Record ID"
          hint="Durable merge key. Edit via import/merge if the hub used a different ID."
        >
          <input className="input font-mono" value={item.id} readOnly />
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
      <DecisionAttestPanel item={item} hedera={hedera} onApplied={onUpdate} />
      {showDelete && onDelete ? (
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => onDelete(item.id)}
        >
          Delete
        </button>
      ) : null}
    </article>
  );
}
