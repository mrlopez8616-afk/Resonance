import "server-only";

import {
  GATE_COOKIE_NAME,
  GATE_MAX_AGE_SECONDS,
  passwordsMatch,
  signGateToken,
  verifyGateToken,
} from "./app-gate-crypto";

export {
  GATE_COOKIE_NAME,
  GATE_MAX_AGE_SECONDS,
  passwordsMatch,
  signGateToken,
  verifyGateToken,
};

export function getAppPassword(): string | null {
  const value = process.env.RESONANCE_APP_PASSWORD?.trim() ?? "";
  return value ? value : null;
}

export function isGateEnabled(): boolean {
  return getAppPassword() !== null;
}

export function gateCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: GATE_MAX_AGE_SECONDS,
  };
}
