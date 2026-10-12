"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { IdeaCard, IdeaStatus } from "@/lib/future-ideas";
import styles from "@/components/ideas-board.module.css";

const STATUSES: { id: IdeaStatus; label: string }[] = [
  { id: "idea", label: "Idea" },
  { id: "someday", label: "Someday" },
  { id: "queued", label: "Queued" },
  { id: "done", label: "Done" },
];

type Draft = {
  title: string;
  note: string;
  status: IdeaStatus;
  tags: string;
  addedOn: string;
};

function draftFrom(card: IdeaCard | null, today: string): Draft {
  if (!card) {
    return { title: "", note: "", status: "idea", tags: "", addedOn: today };
  }
  return {
    title: card.title,
    note: card.note,
    status: card.status,
    tags: card.tags.join(", "),
    addedOn: card.addedOn,
  };
}

function tagsFrom(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function IdeaForm({
  card,
  today,
  onDone,
}: {
  card: IdeaCard | null;
  today: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(card, today));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const editing = card !== null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const fields = {
      title: draft.title,
      note: draft.note,
      status: draft.status,
      tags: tagsFrom(draft.tags),
      added_on: draft.addedOn,
    };
    const payload = editing && card ? { id: card.id, ...fields } : fields;
    try {
      const response = await fetch("/api/ideas", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !body?.ok) {
        setError(body?.error ?? "The idea was not saved.");
        setSaving(false);
        return;
      }
      if (!editing) setDraft(draftFrom(null, today));
      onDone?.();
      router.refresh();
    } catch {
      setError("The idea was not saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className="auth-label" htmlFor={editing ? `idea-title-${card.id}` : "idea-title"}>
        Title
      </label>
      <input
        id={editing ? `idea-title-${card.id}` : "idea-title"}
        className="auth-input"
        value={draft.title}
        onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        required
        maxLength={160}
      />
      <label className="auth-label" htmlFor={editing ? `idea-note-${card.id}` : "idea-note"}>
        Note
      </label>
      <textarea
        id={editing ? `idea-note-${card.id}` : "idea-note"}
        className={`auth-input ${styles.noteField}`}
        value={draft.note}
        onChange={(event) => setDraft({ ...draft, note: event.target.value })}
        rows={4}
        maxLength={2000}
      />
      <label className="auth-label" htmlFor={editing ? `idea-status-${card.id}` : "idea-status"}>
        Status
      </label>
      <select
        id={editing ? `idea-status-${card.id}` : "idea-status"}
        className="auth-input"
        value={draft.status}
        onChange={(event) => setDraft({ ...draft, status: event.target.value as IdeaStatus })}
      >
        {STATUSES.map((status) => (
          <option key={status.id} value={status.id}>
            {status.label}
          </option>
        ))}
      </select>
      <label className="auth-label" htmlFor={editing ? `idea-tags-${card.id}` : "idea-tags"}>
        Tags
      </label>
      <input
        id={editing ? `idea-tags-${card.id}` : "idea-tags"}
        className="auth-input"
        value={draft.tags}
        onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
        placeholder="node, product"
      />
      <label className="auth-label" htmlFor={editing ? `idea-date-${card.id}` : "idea-date"}>
        Date added
      </label>
      <input
        id={editing ? `idea-date-${card.id}` : "idea-date"}
        className="auth-input"
        type="date"
        value={draft.addedOn}
        onChange={(event) => setDraft({ ...draft, addedOn: event.target.value })}
        required
      />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button type="submit" className={`auth-button ${styles.save}`} disabled={saving}>
          {saving ? "Saving" : editing ? "Save" : "Add idea"}
        </button>
        {onDone ? (
          <button type="button" className={styles.action} onClick={onDone} disabled={saving}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function IdeaActions({ card }: { card: IdeaCard }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function setArchived(archived: boolean) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/ideas", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: card.id, archived }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !body?.ok) {
        setError(body?.error ?? "The idea was not saved.");
        setSaving(false);
        return;
      }
      router.refresh();
    } catch {
      setError("The idea was not saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.controls}>
      {editing ? (
        <IdeaForm card={card} today={card.addedOn} onDone={() => setEditing(false)} />
      ) : (
        <div className={styles.actions}>
          <button type="button" className={styles.action} onClick={() => setEditing(true)}>
            Edit
          </button>
          <button
            type="button"
            className={styles.action}
            aria-label={card.archived ? `Restore ${card.title}` : `Archive ${card.title}`}
            onClick={() => setArchived(!card.archived)}
            disabled={saving}
          >
            {card.archived ? "Restore" : "Archive"}
          </button>
        </div>
      )}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function IdeaCreate({ today }: { today: string }) {
  return (
    <details className={styles.add}>
      <summary>Add an idea</summary>
      <IdeaForm card={null} today={today} />
    </details>
  );
}
