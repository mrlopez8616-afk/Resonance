import { createHash, timingSafeEqual } from "node:crypto";
import type { EnvLike } from "@/lib/sync-auth-core";

export type FinanceAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

export function getFinanceIngestToken(env: EnvLike = process.env): string | null {
  const value = env.FINANCE_INGEST_TOKEN?.trim() ?? "";
  return value ? value : null;
}

function secretsMatch(provided: string, expected: string): boolean {
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

/**
 * Fail closed. FINANCE_INGEST_TOKEN is not the hub sync secret.
 * An unset token does not leave the route open.
 */
export function authorizeFinanceIngest(input: {
  token: string | null;
  bearer: string | null;
}): FinanceAuthResult {
  if (!input.token) {
    return { ok: false, status: 503, error: "Finance ingest is not configured." };
  }
  if (!input.bearer || !secretsMatch(input.bearer, input.token)) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }
  return { ok: true };
}
