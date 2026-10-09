"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FloorDialog } from "@/components/floor-dialog";

type Choice = "approved" | "declined";

export function ApprovalDecision({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const approving = choice === "approved";

  function close() {
    if (saving) return;
    setChoice(null);
    setError(null);
  }

  async function confirm() {
    if (!choice || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/approvals/${id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: choice,
          note: note.trim() ? note.trim() : undefined,
        }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !body?.ok) {
        setError(body?.error ?? "The decision was not recorded.");
        setSaving(false);
        if (response.status === 409) router.refresh();
        return;
      }
      setChoice(null);
      setNote("");
      router.refresh();
    } catch {
      setError("The decision was not recorded.");
      setSaving(false);
    }
  }

  return (
    <>
      <div className="approval-actions">
        <button
          type="button"
          className="approval-approve"
          aria-label={`Approve ${title}`}
          onClick={() => {
            setError(null);
            setChoice("approved");
          }}
        >
          Approve
        </button>
        <button
          type="button"
          className="approval-decline"
          aria-label={`Decline ${title}`}
          onClick={() => {
            setError(null);
            setChoice("declined");
          }}
        >
          Decline
        </button>
      </div>
      <FloorDialog
        open={choice !== null}
        title={approving ? "Approve this request?" : "Decline this request?"}
        onClose={close}
      >
        <p className="floor-dialog-copy">{title}</p>
        <p className="floor-dialog-copy">
          This records the decision. No trade, transfer, or other action runs.
        </p>
        <label className="approval-note" htmlFor={`approval-note-${id}`}>
          Note, optional
          <textarea
            id={`approval-note-${id}`}
            value={note}
            maxLength={500}
            rows={3}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        {error ? (
          <p className="approval-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="approval-confirm-actions">
          <button
            type="button"
            className={approving ? "approval-approve" : "approval-decline"}
            disabled={saving}
            onClick={() => void confirm()}
          >
            {saving ? "Recording" : approving ? "Confirm approval" : "Confirm decline"}
          </button>
          <button type="button" className="floor-dialog-cancel" disabled={saving} onClick={close}>
            Go back
          </button>
        </div>
      </FloorDialog>
    </>
  );
}
