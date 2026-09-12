import {
  GATE_COOKIE_NAME,
  passwordsMatch,
  verifyGateToken,
} from "./app-gate-crypto";

export type SyncAuthVia =
  | "bearer-secret"
  | "bearer-password"
  | "cookie"
  | "open";

export type SyncAuthResult =
  | { ok: true; via: SyncAuthVia }
  | { ok: false; error: string };

export function getSyncSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.RESONANCE_SYNC_SECRET?.trim() ?? "";
  return value ? value : null;
}

export function getAppPasswordFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = env.RESONANCE_APP_PASSWORD?.trim() ?? "";
  return value ? value : null;
}

export function writeProtectionEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return getSyncSecret(env) !== null || getAppPasswordFromEnv(env) !== null;
}

export function readBearerToken(
  authorizationHeader: string | null | undefined,
): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  const token = match?.[1]?.trim() ?? "";
  return token || null;
}

export function readNamedCookie(
  cookieHeader: string | null | undefined,
  name = GATE_COOKIE_NAME,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== name) continue;
    const value = trimmed.slice(eq + 1);
    return value || null;
  }
  return null;
}

export function authorizeSyncAccess(input: {
  password: string | null;
  syncSecret: string | null;
  bearer: string | null;
  cookieToken: string | null;
  now?: number;
}): SyncAuthResult {
  const { password, syncSecret, bearer, cookieToken, now } = input;
  if (!password && !syncSecret) {
    return { ok: true, via: "open" };
  }
  if (bearer && syncSecret && passwordsMatch(bearer, syncSecret)) {
    return { ok: true, via: "bearer-secret" };
  }
  if (bearer && password && passwordsMatch(bearer, password)) {
    return { ok: true, via: "bearer-password" };
  }
  if (password && verifyGateToken(password, cookieToken ?? undefined, now)) {
    return { ok: true, via: "cookie" };
  }
  return {
    ok: false,
    error:
      "Unlock the site or send Authorization: Bearer <RESONANCE_SYNC_SECRET or RESONANCE_APP_PASSWORD>.",
  };
}
