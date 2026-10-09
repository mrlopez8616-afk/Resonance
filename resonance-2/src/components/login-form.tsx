"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { useState, type FormEvent } from "react";

/** Relative path only, so a home-screen launch never hands the browser to Safari. */
function inAppPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://") || value.includes("\\")) {
    return "/";
  }
  return value;
}

export function LoginForm({
  passkeyReady,
  nextPath,
}: {
  passkeyReady: boolean;
  nextPath: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: String(form.get("username") ?? ""),
          password: String(form.get("password") ?? ""),
          code: String(form.get("code") ?? ""),
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(body?.error ?? "Wrong password or code.");
        setPending(false);
        return;
      }
      window.location.assign(inAppPath(nextPath));
    } catch {
      setError("Sign-in is unavailable.");
      setPending(false);
    }
  }

  async function signInWithPasskey() {
    setPending(true);
    setError(null);
    try {
      const optionsResponse = await fetch("/api/auth/passkey/login/options", { method: "POST" });
      if (!optionsResponse.ok) {
        const body = (await optionsResponse.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Passkey was not accepted.");
        setPending(false);
        return;
      }
      const optionsJSON = await optionsResponse.json();
      const assertion = await startAuthentication({ optionsJSON });
      const verified = await fetch("/api/auth/passkey/login/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(assertion),
      });
      if (!verified.ok) {
        const body = (await verified.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Passkey was not accepted.");
        setPending(false);
        return;
      }
      window.location.assign(inAppPath(nextPath));
    } catch {
      setError("Passkey was not accepted.");
      setPending(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <label className="auth-label" htmlFor="username">
        Username
      </label>
      <input
        id="username"
        name="username"
        type="text"
        autoComplete="username"
        defaultValue="andres"
        className="auth-input"
      />
      <label className="auth-label" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        className="auth-input"
      />
      <label className="auth-label" htmlFor="code">
        Authenticator code
      </label>
      <input
        id="code"
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,8}"
        required
        className="auth-input"
      />
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="auth-button" type="submit" disabled={pending}>
        Sign in
      </button>
      {passkeyReady ? (
        <button
          className="auth-button auth-button-secondary"
          type="button"
          disabled={pending}
          onClick={() => void signInWithPasskey()}
        >
          Use passkey
        </button>
      ) : null}
    </form>
  );
}
