"use client";

import { useState } from "react";

export function FitnessTokenCopy({ configured }: { configured: boolean }) {
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const [fallback, setFallback] = useState<string | null>(null);

  async function fetchToken(): Promise<string> {
    const response = await fetch("/api/fitness/token", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as { token?: unknown } | null;
    const token = typeof body?.token === "string" ? body.token : "";
    if (!response.ok || token.length === 0) {
      throw new Error(response.status === 503 ? "not configured" : "Could not copy.");
    }
    return token;
  }

  // iOS Safari drops the tap's permission once an await runs, so the clipboard
  // write starts synchronously with a ClipboardItem that resolves later.
  function copy() {
    if (pending) return;
    setPending(true);
    setNote(null);
    setFallback(null);
    const tokenPromise = fetchToken();
    let write: Promise<void>;
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        const item = new ClipboardItem({
          "text/plain": tokenPromise.then((t) => new Blob([t], { type: "text/plain" })),
        });
        write = navigator.clipboard.write([item]);
      } else {
        write = tokenPromise.then((t) => navigator.clipboard.writeText(t));
      }
    } catch (error) {
      write = Promise.reject(error);
    }
    write
      .then(() => setNote("Copied"))
      .catch(async (error: unknown) => {
        const message = error instanceof Error ? error.message : "";
        if (message === "not configured") return setNote("not configured");
        try {
          setFallback(await tokenPromise);
          setNote("Tap and hold the field below, then tap Copy.");
        } catch {
          setNote("Could not copy.");
        }
      })
      .finally(() => setPending(false));
  }

  return (
    <section className="fitness-setup" aria-label="Shortcut token">
      <h2 className="node-ticker">Resonance Nightly</h2>
      {configured ? (
        <button className="auth-button" type="button" disabled={pending} onClick={copy}>
          Copy token
        </button>
      ) : (
        <p className="auth-note">not configured</p>
      )}
      {fallback ? (
        <input
          className="auth-input"
          type="text"
          readOnly
          value={fallback}
          aria-label="Shortcut token"
          autoComplete="off"
          onFocus={(e) => e.currentTarget.select()}
        />
      ) : null}
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
