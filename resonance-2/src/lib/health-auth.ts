import { createHash, timingSafeEqual } from "node:crypto";
import { getSyncSecret, readBearerToken, type EnvLike } from "@/lib/sync-auth-core";

/**
 * Read-only probe credential. It is not the hub sync secret and it cannot
 * write. An unset value fails closed. The compare hashes both sides first
 * so a length mismatch cannot skip the timing-safe check.
 */
export function getHealthToken(env: EnvLike = process.env): string | null {
  const value = env.RESONANCE_HEALTH_TOKEN?.trim() ?? "";
  return value ? value : null;
}

function secretsMatch(provided: string, expected: string): boolean {
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export function authorizeHealthRequest(
  request: { headers: { get(name: string): string | null } },
  env: EnvLike = process.env,
): boolean {
  const expected = getHealthToken(env);
  const bearer = readBearerToken(request.headers.get("authorization"));
  if (!expected || !bearer) return false;
  if (!secretsMatch(bearer, expected)) return false;
  const sync = getSyncSecret(env);
  if (sync && secretsMatch(bearer, sync)) return false;
  return true;
}
