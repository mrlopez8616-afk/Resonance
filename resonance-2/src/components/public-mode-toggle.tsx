"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import {
  lockoutLabel,
  lockoutRemainingMs,
  type PublicModeClientStatus,
} from "@/lib/owner-pin";

const SWITCH_ERROR: Record<number, string> = {
  401: "Sign in required.",
  403: "Wrong PIN.",
  409: "Set a PIN before public mode can be switched on.",
  415: "Use the PIN form.",
  422: "Enter a 4 to 6 digit PIN.",
};

/**
 * Owner public/private control. Drop `<PublicModeToggle />` into the desktop
 * rail or the phone tab bar. It opens the PIN dialog, shows the lockout, and
 * posts the switch itself.
 */
export function PublicModeToggle({
  on,
  status,
  compact = false,
  showLock = true,
  className,
}: {
  on: boolean;
  status: PublicModeClientStatus;
  compact?: boolean;
  showLock?: boolean;
  className?: string;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(status.lockedUntil);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setLockedUntil(status.lockedUntil);
  }, [status.lockedUntil]);

  useEffect(() => {
    if (!open && !lockedUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [open, lockedUntil]);

  const remaining = lockoutRemainingMs(lockedUntil ? Date.parse(lockedUntil) : null, now);
  const locked = remaining > 0;
  const nextOn = !on;

  function close() {
    setOpen(false);
    setPin("");
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || locked || !status.pinSet) return;
    const entered = pin;
    setPin("");
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/public-mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: nextOn, pin: entered }),
      });
      const body = (await response.json().catch(() => null)) as { lockedUntil?: unknown } | null;
      if (response.ok) {
        window.location.reload();
        return;
      }
      if (response.status === 423 && typeof body?.lockedUntil === "string") {
        setLockedUntil(body.lockedUntil);
        setError(null);
        return;
      }
      setError(SWITCH_ERROR[response.status] ?? "Could not switch.");
    } catch {
      setError("Could not switch.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={[compact ? "operator-tool public-mode-tool" : "public-switch-button", className]
          .filter(Boolean)
          .join(" ")}
        aria-pressed={on}
        aria-haspopup="dialog"
        data-public-switch={on ? "on" : "off"}
        disabled={status.unavailable}
        onClick={() => {
          setError(null);
          setPin("");
          setOpen(true);
        }}
      >
        {on ? "Private" : "Public"}
      </button>
      {locked && showLock ? (
        <p className={on ? "public-lock is-under-banner" : "public-lock"} role="status" data-lockout>
          {lockoutLabel(remaining)}
        </p>
      ) : null}
      {open ? (
        <div className="floor-dialog-backdrop pin-dialog-backdrop" role="presentation" onClick={close}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="floor-dialog pin-dialog"
            data-pin-dialog
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void submit(event)}
          >
            <h2 id={titleId} className="floor-dialog-title">
              {status.pinSet ? (nextOn ? "Turn on public mode" : "Turn off public mode") : "Set a PIN first"}
            </h2>
            {status.unavailable ? (
              <p className="floor-dialog-copy">The mode switch is unavailable.</p>
            ) : locked ? (
              <p className="floor-dialog-copy" role="status" data-lockout>
                {lockoutLabel(remaining)}
              </p>
            ) : status.pinSet ? (
              <>
                <p className="floor-dialog-copy">Enter the owner PIN. It is not your password or authenticator code.</p>
                <label className="auth-label" htmlFor={`${titleId}-pin`}>
                  PIN
                </label>
                <input
                  id={`${titleId}-pin`}
                  className="auth-input"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  pattern="[0-9]*"
                  minLength={4}
                  maxLength={6}
                  value={pin}
                  data-pin-input
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </>
            ) : (
              <p className="floor-dialog-copy">
                Public mode stays off until you set a 4 to 6 digit PIN.
                {on ? null : (
                  <>
                    {" "}
                    <a href="/settings/security#owner-pin">Set PIN</a>
                  </>
                )}
              </p>
            )}
            {error ? (
              <p className="auth-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="floor-dialog-actions">
              <button type="button" className="floor-dialog-cancel" onClick={close}>
                Close
              </button>
              {status.pinSet && !locked && !status.unavailable ? (
                <button type="submit" className="floor-dialog-confirm" disabled={pending || pin.length < 4}>
                  Confirm
                </button>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
