"use client";

import { useState } from "react";

export function FitnessTokenCopy({ configured }: { configured: boolean }) {
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function copy() {
    if (pending) return;
    setPending(true);
    setNote(null);
    try {
      const response = await fetch("/api/fitness/token", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as { token?: unknown } | null;
      const token = typeof body?.token === "string" ? body.token : "";
      if (!response.ok || token.length === 0) {
        setNote(response.status === 503 ? "not configured" : "Could not copy.");
        return;
      }
      await navigator.clipboard.writeText(token);
      setNote("Copied");
    } catch {
      setNote("Could not copy.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="fitness-setup" aria-label="Shortcut token">
      <h2 className="node-ticker">Resonance Nightly</h2>
      {configured ? (
        <button className="auth-button" type="button" disabled={pending} onClick={() => void copy()}>
          Copy token
        </button>
      ) : (
        <p className="auth-note">not configured</p>
      )}
      {note ? (
        <p className="auth-note" role="status">
          {note}
        </p>
      ) : (
        <p className="auth-note">Paste it after Bearer in the shortcut. This page does not show the token.</p>
      )}
    </section>
  );
}
