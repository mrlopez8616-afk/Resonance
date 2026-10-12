"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function RoundtableReply({ threadId }: { threadId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/roundtable/${encodeURIComponent(threadId)}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "The reply was not saved.");
        setSaving(false);
        return;
      }
      setText("");
      setSaving(false);
      router.refresh();
    } catch {
      setError("The reply was not saved.");
      setSaving(false);
    }
  }

  return (
    <form className="roundtable-reply" onSubmit={submit}>
      <label htmlFor="roundtable-reply">
        Reply
        <textarea
          id="roundtable-reply"
          name="body"
          value={text}
          maxLength={4000}
          required
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <button className="roundtable-send" type="submit" disabled={saving || text.trim() === ""}>
        Send
      </button>
      {error ? (
        <p className="approval-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
