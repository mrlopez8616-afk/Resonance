"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { mergeDecisionsFromServer } from "@/lib/app-store";
import { hydrateDecisionsFromServer } from "@/lib/decisions-client-sync";

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/unlock")) return "/";
  return value;
}

function UnlockForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/gate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        setError(body?.error || "Unlock failed.");
        setPending(false);
        return;
      }
      await hydrateDecisionsFromServer(mergeDecisionsFromServer);
      router.push(safeNextPath(searchParams.get("next")));
      router.refresh();
    } catch {
      setError("Unlock failed. Try again.");
      setPending(false);
    }
  }

  return (
    <form className="card space-y-4" onSubmit={submit}>
      <label className="block">
        <span className="mb-1.5 block text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
          Password
        </span>
        <input
          className="input"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      {error ? (
        <p className="text-sm text-[color:var(--danger)]">{error}</p>
      ) : null}
      <button className="btn btn-primary w-full" type="submit" disabled={pending}>
        {pending ? "Unlocking…" : "Unlock"}
      </button>
    </form>
  );
}

export default function UnlockPage() {
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--accent)]/40 text-[color:var(--accent)]"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="2" fill="currentColor" />
              <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1" />
              <circle
                cx="8"
                cy="8"
                r="7.25"
                stroke="currentColor"
                strokeWidth="0.75"
                opacity="0.45"
              />
            </svg>
          </span>
          <div>
            <p className="text-sm font-medium tracking-wide">Resonance</p>
            <p className="kicker mt-0.5">Phase Zero</p>
          </div>
        </div>
        <h1 className="text-2xl tracking-tight">Unlock</h1>
        <p className="mt-2 mb-6 text-sm leading-6 text-[color:var(--muted)]">
          Operator gate for this browser session. No account, no email. The
          password is checked on the server and never stored in localStorage.
        </p>
        <Suspense
          fallback={
            <p className="text-sm text-[color:var(--muted)]">Loading unlock…</p>
          }
        >
          <UnlockForm />
        </Suspense>
        <p className="mt-6 text-xs leading-5 text-[color:var(--muted)]">
          Never paste a seed phrase or brokerage secret here. This only unlocks
          the local dashboard.
        </p>
      </div>
    </div>
  );
}
