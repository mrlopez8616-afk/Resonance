"use client";

import { useState } from "react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Field } from "@/components/ui";
import { useStore } from "@/context/store";
import { todayIsoDate } from "@/lib/format";
import type { DecisionStatus } from "@/lib/types";

export default function DecisionsPage() {
  const { ready, state, addDecision, updateDecision, deleteDecision } =
    useStore();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState("");
  const [status, setStatus] = useState<DecisionStatus>("pending");
  const [decision, setDecision] = useState("");
  const [date, setDate] = useState(todayIsoDate());
  const [error, setError] = useState<string | null>(null);

  const rows = [...state.decisions].sort(
    (a, b) =>
      b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!question.trim()) {
      setError("Write the question.");
      return;
    }
    if (status === "decided" && !decision.trim()) {
      setError("A decided row needs the actual decision.");
      return;
    }
    addDecision({
      question: question.trim(),
      options: options.trim(),
      status,
      decision: decision.trim(),
      date,
    });
    setQuestion("");
    setOptions("");
    setDecision("");
    setStatus("pending");
    setError(null);
  }

  if (!ready) {
    return (
      <p className="text-sm text-[color:var(--muted)]">Loading decisions…</p>
    );
  }

  return (
    <div>
      <PageHeader
        kicker="Governance"
        title="Decisions"
        description="A dated log of questions, options, and calls. Phase Zero is human-governed: nothing here executes."
      />

      <form className="card mb-8 grid gap-4 lg:grid-cols-2" onSubmit={submit}>
        <div className="lg:col-span-2">
          <h2 className="text-lg">New entry</h2>
        </div>
        <Field label="Question">
          <input
            className="input"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="What has to be decided?"
          />
        </Field>
        <Field label="Date">
          <input
            className="input"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <Field label="Options">
          <input
            className="input"
            value={options}
            onChange={(event) => setOptions(event.target.value)}
            placeholder="A · B · C"
          />
        </Field>
        <Field label="Status">
          <select
            className="select"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as DecisionStatus)
            }
          >
            <option value="pending">Pending</option>
            <option value="decided">Decided</option>
          </select>
        </Field>
        <div className="lg:col-span-2">
          <Field label="Decision (if called)">
            <textarea
              className="textarea"
              value={decision}
              onChange={(event) => setDecision(event.target.value)}
              placeholder="The call, constraints, and what would reverse it."
            />
          </Field>
        </div>
        {error ? (
          <p className="text-sm text-[color:var(--danger)]">{error}</p>
        ) : null}
        <div>
          <button className="btn btn-primary" type="submit">
            Add decision
          </button>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="Decision log is empty"
          body="Capture the live question first: next funded node, vault vs liquid, or whether YouTube belongs in this quarter."
        />
      ) : (
        <div className="space-y-4">
          {rows.map((item) => (
            <article key={item.id} className="card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="kicker">{item.date}</p>
                <select
                  className="select w-auto"
                  value={item.status}
                  onChange={(event) =>
                    updateDecision(item.id, {
                      status: event.target.value as DecisionStatus,
                    })
                  }
                >
                  <option value="pending">Pending</option>
                  <option value="decided">Decided</option>
                </select>
              </div>
              <h2 className="text-base">{item.question}</h2>
              {item.options ? (
                <p className="text-sm text-[color:var(--muted)]">
                  Options: {item.options}
                </p>
              ) : null}
              <Field label="Decision / notes">
                <textarea
                  className="textarea"
                  value={item.decision}
                  onChange={(event) =>
                    updateDecision(item.id, { decision: event.target.value })
                  }
                />
              </Field>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => deleteDecision(item.id)}
              >
                Delete
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
