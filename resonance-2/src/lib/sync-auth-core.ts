import { createHash, timingSafeEqual } from "node:crypto";

export type SyncAuthVia = "bearer-secret" | "open";

export type SyncAuthResult =
  | { ok: true; via: SyncAuthVia }
  | { ok: false; error: string };

export type EnvLike = Record<string, string | undefined>;

export function getSyncSecret(env: EnvLike = process.env): string | null {
  const value = env.RESONANCE_SYNC_SECRET?.trim() ?? "";
  return value ? value : null;
}

export function writeProtectionEnabled(
  env: EnvLike = process.env,
): boolean {
  return getSyncSecret(env) !== null;
}

export function readBearerToken(
  authorizationHeader: string | null | undefined,
): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  const token = match?.[1]?.trim() ?? "";
  return token || null;
}

function secretsMatch(provided: string, expected: string): boolean {
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

/** Phase Zero Bearer-secret spirit: open only when the secret is unset (local/dev). */
export function authorizeSyncAccess(input: {
  syncSecret: string | null;
  bearer: string | null;
}): SyncAuthResult {
  const { syncSecret, bearer } = input;
  if (!syncSecret) {
    return { ok: true, via: "open" };
  }
  if (bearer && secretsMatch(bearer, syncSecret)) {
    return { ok: true, via: "bearer-secret" };
  }
  return {
    ok: false,
    error: "Send Authorization: Bearer <RESONANCE_SYNC_SECRET>.",
  };
}
