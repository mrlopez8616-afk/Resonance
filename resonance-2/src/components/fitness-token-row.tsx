"use client";

import { useEffect, useState, type ReactNode } from "react";

const VISIBLE_MS = 60_000;

export function FitnessTokenRow({
  configured,
  shortcut,
}: {
  configured: boolean;
  shortcut: ReactNode;
}) {
  const [code, setCode] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(!configured);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const timer = window.setTimeout(() => {
      setToken(null);
      setCopied(false);
    }, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [token]);

  async function reveal() {
    if (token) {
      setToken(null);
      setCopied(false);
      setError(null);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/fitness-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ code }),
      });
      const body = (await response.json().catch(() => null)) as {
        token?: unknown;
        error?: unknown;
      } | null;
      if (response.status === 503) {
        setUnavailable(true);
        setToken(null);
        return;
      }
      if (!response.ok || typeof body?.token !== "string" || body.token.length === 0) {
        setToken(null);
        setError(typeof body?.error === "string" ? body.error : "Could not reveal the token.");
        return;
      }
      setToken(body.token);
      setCopied(false);
    } catch {
      setToken(null);
      setError("Could not reveal the token.");
    } finally {
      setPending(false);
    }
  }

  async function copyToken() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setError("Select the token and copy it.");
    }
  }

  return (
    <section className="security-block" data-fitness-token-row>
      <h3>Fitness sync token</h3>
      {unavailable ? (
        <p className="auth-note" data-fitness-token-status>
          not configured
        </p>
      ) : (
        <>
          <p
            className="security-token-value"
            data-fitness-token-value
            data-revealed={token ? "yes" : "no"}
          >
            {token ?? "••••"}
          </p>
          <p className="auth-note">Shows for a minute, then hides.</p>
          <div className="security-token-actions">
            <label className="security-token-code">
              <span className="auth-label">Authenticator code</span>
              <input
                className="auth-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={6}
                value={code}
                aria-label="Authenticator code"
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                  setError(null);
                }}
              />
            </label>
            <button
              className="auth-button"
              type="button"
              aria-pressed={token ? true : false}
              disabled={pending || (!token && code.length !== 6)}
              onClick={() => void reveal()}
            >
              {token ? "Hide" : "Reveal"}
            </button>
            <button
              className="auth-button auth-button-secondary"
              type="button"
              disabled={!token || pending}
              onClick={() => void copyToken()}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      )}
      {shortcut}
    </section>
  );
}
