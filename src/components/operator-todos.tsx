"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSyncExternalStore } from "react";
import { Field } from "@/components/ui";
import { decisionDetailHref } from "@/lib/decision-browser";
import {
  addOperatorTodo,
  deleteOperatorTodo,
  getServerTodosSyncSnapshot,
  getTodosSyncSnapshot,
  hydrateTodosFromServer,
  subscribeTodosSync,
  toggleOperatorTodo,
} from "@/lib/todos-client-sync";
import type { Decision } from "@/lib/types";

export function OperatorTodoList({ decisions }: { decisions: Decision[] }) {
  const sync = useSyncExternalStore(
    subscribeTodosSync,
    getTodosSyncSnapshot,
    getServerTodosSyncSnapshot,
  );
  const [text, setText] = useState("");
  const [linkedDecisionId, setLinkedDecisionId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void hydrateTodosFromServer();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) {
      setError("Write the to-do.");
      return;
    }
    try {
      await addOperatorTodo({
        text,
        linkedDecisionId: linkedDecisionId || null,
      });
      setText("");
      setLinkedDecisionId("");
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add this to-do.");
    }
  }

  const openCount = sync.todos.filter((item) => !item.done).length;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg">Operator to-do</h2>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Simple list under Decisions. Lives in the shared store when Blob is
          on, so a phone and a laptop stay in sync. {openCount} open.
        </p>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          {sync.status === "idle" || sync.status === "checking"
            ? "Checking the shared list…"
            : sync.status === "synced"
              ? `Live on all unlocked devices (${sync.backend}).`
              : sync.status === "local"
                ? sync.reason
                : sync.message}
        </p>
      </div>

      <form className="card grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={submit}>
        <Field label="New to-do">
          <input
            className="input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="What needs to happen next?"
          />
        </Field>
        <Field label="Link a decision (optional)">
          <select
            className="select"
            value={linkedDecisionId}
            onChange={(event) => setLinkedDecisionId(event.target.value)}
          >
            <option value="">None</option>
            {decisions.map((decision) => (
              <option key={decision.id} value={decision.id}>
                {decision.id}
              </option>
            ))}
          </select>
        </Field>
        {error ? (
          <p className="text-sm text-[color:var(--danger)] sm:col-span-2">
            {error}
          </p>
        ) : null}
        <div>
          <button className="btn btn-primary" type="submit">
            Add to-do
          </button>
        </div>
      </form>

      {sync.todos.length === 0 ? (
        <p className="text-sm text-[color:var(--muted)]">
          No to-dos yet. Add one so Monday follow-ups are not stuck in chat.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-[color:var(--border)]">
          {sync.todos.map((item) => {
            const linked = item.linkedDecisionId
              ? decisions.find((row) => row.id === item.linkedDecisionId)
              : null;
            return (
              <li key={item.id} className="file-row items-start sm:items-center">
                <label className="flex min-w-0 flex-1 items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={item.done}
                    onChange={() => void toggleOperatorTodo(item.id)}
                  />
                  <span className="min-w-0">
                    <span
                      className={`block text-sm ${
                        item.done
                          ? "text-[color:var(--muted)] line-through"
                          : "text-[color:var(--text)]"
                      }`}
                    >
                      {item.text}
                    </span>
                    {item.linkedDecisionId ? (
                      <span className="mt-1 block font-mono text-xs text-[color:var(--muted)]">
                        {item.linkedDecisionId}
                        {linked ? ` · ${linked.question}` : ""}
                      </span>
                    ) : null}
                  </span>
                </label>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {item.linkedDecisionId ? (
                    <Link
                      href={decisionDetailHref(item.linkedDecisionId)}
                      className="btn btn-secondary"
                    >
                      Open decision
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => void deleteOperatorTodo(item.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
