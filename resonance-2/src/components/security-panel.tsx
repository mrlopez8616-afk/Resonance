"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useState } from "react";

export type SecuritySession = {
  label: string;
  lastSeen: string;
  created: string;
  current: boolean;
};

export type SecurityPasskey = {
  id: string;
  label: string;
  created: string;
  lastUsed: string;
};

export function SecurityPanel({
  sessions,
  passkeys,
  passkeysConfigured,
}: {
  sessions: SecuritySession[];
  passkeys: SecurityPasskey[];
  passkeysConfigured: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function addPasskey() {
    setPending(true);
    setError(null);
    try {
      const optionsResponse = await fetch("/api/auth/passkey/register/options", { method: "POST" });
      if (!optionsResponse.ok) {
        const body = (await optionsResponse.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Passkey was not accepted.");
        setPending(false);
        return;
      }
      const optionsJSON = await optionsResponse.json();
      const attestation = await startRegistration({ optionsJSON });
      const verified = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(attestation),
      });
      if (!verified.ok) {
        const body = (await verified.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Passkey was not accepted.");
        setPending(false);
        return;
      }
      window.location.reload();
    } catch {
      setError("Passkey was not accepted.");
      setPending(false);
    }
  }

  async function remove(id: string) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/passkey/remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        setError("Passkey was not removed.");
        setPending(false);
        return;
      }
      window.location.reload();
    } catch {
      setError("Passkey was not removed.");
      setPending(false);
    }
  }

  return (
    <div className="security-page" data-security-page>
      <h2 className="auth-title">Security</h2>
      <p className="auth-note">
        Password and an authenticator code stay the way in. A passkey is optional and is never
        asked for after sign-in.
      </p>

      <section className="security-block">
        <h3>Devices</h3>
        <ul>
          {sessions.map((session) => (
            <li key={`${session.label}-${session.created}`} className="security-row">
              <span>
                {session.label}
                {session.current ? <span className="security-current">This device</span> : null}
              </span>
              <span>Last seen {session.lastSeen}</span>
            </li>
          ))}
        </ul>
        <div className="security-actions">
          <form action="/api/auth/logout" method="post">
            <button className="auth-button auth-button-secondary" type="submit">
              Sign out
            </button>
          </form>
          <form action="/api/auth/logout-all" method="post">
            <button className="auth-button auth-button-secondary" type="submit">
              Sign out everywhere
            </button>
          </form>
        </div>
      </section>

      <section className="security-block">
        <h3>Passkeys</h3>
        {passkeys.length === 0 ? <p className="auth-note">No passkey yet.</p> : null}
        <ul>
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="security-row">
              <span>{passkey.label}</span>
              <span>Added {passkey.created}</span>
              <span>Last used {passkey.lastUsed}</span>
              <button
                className="auth-button auth-button-secondary"
                type="button"
                disabled={pending}
                onClick={() => void remove(passkey.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button
          className="auth-button"
          type="button"
          disabled={pending || !passkeysConfigured}
          onClick={() => void addPasskey()}
        >
          Add passkey
        </button>
        {!passkeysConfigured ? (
          <p className="auth-note">Set WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN to add a passkey.</p>
        ) : null}
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
