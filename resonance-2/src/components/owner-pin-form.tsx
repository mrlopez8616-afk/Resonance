"use client";

import { useState, type FormEvent } from "react";
import { lockoutLabel, type ModeLogRow } from "@/lib/owner-pin";

const SAVE_ERROR: Record<number, string> = {
  401: "Sign in required.",
  403: "Wrong PIN.",
  404: "Private.",
  422: "Enter the same 4 to 6 digit PIN twice.",
};

function logLine(row: ModeLogRow): string {
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(row.at));
  const direction = row.direction === "public" ? "to public" : "to private";
  return `${when} · ${direction} · ${row.outcome} · ${row.userAgent}`;
}

export function OwnerPinForm({
  pinSet,
  log,
}: {
  pinSet: boolean;
  log: readonly ModeLogRow[];
}) {
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function digits(value: string, max: number) {
    return value.replace(/\D/g, "").slice(0, max);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const payload = pinSet
      ? { current, pin, confirm }
      : { pin, confirm, totp };
    setCurrent("");
    setPin("");
    setConfirm("");
    setTotp("");
    try {
      const response = await fetch("/api/settings/owner-pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        window.location.reload();
        return;
      }
      if (response.status === 423) {
        const body = (await response.json().catch(() => null)) as { retryInSec?: unknown } | null;
        const seconds = typeof body?.retryInSec === "number" ? body.retryInSec : 0;
        setError(lockoutLabel(seconds * 1000));
        return;
      }
      const wrongCode = response.status === 403 && !pinSet;
      setError(wrongCode ? "Wrong code." : (SAVE_ERROR[response.status] ?? "Could not save the PIN."));
    } catch {
      setError("Could not save the PIN.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="security-block" id="owner-pin" aria-label="Owner PIN" data-owner-pin-form>
      <h3>Owner PIN</h3>
      <p className="auth-note">
        {pinSet
          ? "Four to six digits. Changing it takes the current PIN. It is not your password or authenticator code."
          : "Set a 4 to 6 digit PIN before public mode can be switched on. This signed-in session plus your authenticator code saves the first one."}
      </p>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        {pinSet ? (
          <>
            <label className="auth-label" htmlFor="owner-pin-current">
              Current PIN
            </label>
            <input
              id="owner-pin-current"
              className="auth-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]*"
              maxLength={6}
              value={current}
              onChange={(event) => setCurrent(digits(event.target.value, 6))}
            />
          </>
        ) : (
          <>
            <label className="auth-label" htmlFor="owner-pin-totp">
              Authenticator code
            </label>
            <input
              id="owner-pin-totp"
              className="auth-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]*"
              maxLength={6}
              value={totp}
              onChange={(event) => setTotp(digits(event.target.value, 6))}
            />
          </>
        )}
        <label className="auth-label" htmlFor="owner-pin-next">
          {pinSet ? "New PIN" : "PIN"}
        </label>
        <input
          id="owner-pin-next"
          className="auth-input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          minLength={4}
          maxLength={6}
          value={pin}
          data-new-pin
          onChange={(event) => setPin(digits(event.target.value, 6))}
        />
        <label className="auth-label" htmlFor="owner-pin-confirm">
          PIN again
        </label>
        <input
          id="owner-pin-confirm"
          className="auth-input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          minLength={4}
          maxLength={6}
          value={confirm}
          onChange={(event) => setConfirm(digits(event.target.value, 6))}
        />
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="auth-button" type="submit" disabled={pending}>
          {pinSet ? "Change PIN" : "Save PIN"}
        </button>
      </form>
      <h3>Mode changes</h3>
      {log.length === 0 ? <p className="auth-note">No mode changes yet.</p> : null}
      <ul data-mode-log>
        {log.map((row) => (
          <li key={row.id} className="security-row">
            <span>{logLine(row)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
