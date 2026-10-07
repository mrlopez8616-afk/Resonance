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

export const FITNESS_TOKEN_HEADER = "x-fitness-token";

export function getFitnessIngestToken(env: EnvLike = process.env): string | null {
  const value = env.FITNESS_INGEST_TOKEN?.trim() ?? "";
  return value ? value : null;
}

export type FitnessAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

/**
 * Fail closed. The phone token is not the hub sync secret, and an unset
 * FITNESS_INGEST_TOKEN does not leave the route open.
 */
export function authorizeFitnessAccess(input: {
  token: string | null;
  bearer: string | null;
  headerToken: string | null;
}): FitnessAuthResult {
  if (!input.token) {
    return { ok: false, status: 503, error: "Fitness ingest is not configured." };
  }
  const provided = input.bearer || input.headerToken;
  if (provided && secretsMatch(provided, input.token)) return { ok: true };
  return {
    ok: false,
    status: 401,
    error: "Send Authorization: Bearer <token> or X-Fitness-Token.",
  };
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
