"use client";

import { useState } from "react";

export function FactorioToken({ configured }: { configured: boolean }) {
  const [pending, setPending] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function generate() {
    if (pending) return;
    setPending(true);
    setNote(null);
    try {
      const response = await fetch("/api/settings/factorio-token", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as { token?: unknown } | null;
      const value = typeof body?.token === "string" ? body.token : "";
      if (!response.ok || value.length === 0) {
        setNote(response.status === 404 ? "Private." : "Could not generate a token.");
        return;
      }
      setToken(value);
      setNote("Copy it now. This is the only time it is shown. Rotating replaces the previous token.");
    } catch {
      setNote("Could not generate a token.");
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setNote("Copied. Paste it into the PC uploader header.");
    } catch {
      setNote("Select the token and copy it.");
    }
  }

  return (
    <section className="fitness-setup" aria-label="Factorio token">
      <p>{token ? "The new token is below." : configured ? "A token is set." : "No token yet."}</p>
      <button className="auth-button" type="button" disabled={pending} onClick={() => void generate()}>
        Generate / rotate Factorio token
      </button>
      {token ? (
        <>
          <input
            className="auth-input"
            type="text"
            readOnly
            value={token}
            aria-label="Factorio token"
            autoComplete="off"
            spellCheck={false}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button className="auth-button auth-button-secondary" type="button" onClick={() => void copy()}>
            Copy token
          </button>
        </>
      ) : null}
      {note ? <p className="auth-note">{note}</p> : null}
    </section>
  );
}
