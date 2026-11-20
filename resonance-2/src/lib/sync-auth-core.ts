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

export function getCronSecret(env: EnvLike = process.env): string | null {
  const value = env.CRON_SECRET?.trim() ?? "";
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

/** Drop one leading "Bearer " and surrounding whitespace. The word is optional. */
export function stripOptionalBearer(value: string): string {
  const trimmed = value.trim();
  const match = /^Bearer\s+/i.exec(trimmed);
  if (!match) return trimmed;
  return trimmed.slice(match[0].length).trim();
}

/** Drop up to two leading Bearer or Token schemes. The word match is case-insensitive. */
function stripIngestScheme(value: string): string {
  let current = value.trim();
  for (let i = 0; i < 2; i += 1) {
    const match = /^(?:Bearer|Token)\s+/i.exec(current);
    if (!match) return current;
    current = current.slice(match[0].length).trim();
  }
  return current;
}

/**
 * Token from an Authorization header.
 * `Bearer <token>` and `Token <token>` are accepted. The scheme match is case-insensitive.
 * A second Bearer or Token prefix is ignored.
 * A value with no scheme is the token itself. Basic and other schemes are not tokens.
 */
export function readAuthorizationCredential(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (/^(?:Bearer|Token)\b/i.test(trimmed)) {
    const token = stripIngestScheme(trimmed);
    return token || null;
  }
  if (/^[A-Za-z][A-Za-z0-9._-]*\s+\S/.test(trimmed)) return null;
  return trimmed;
}

const DOUBLE_QUOTES = new Set(['"', "\u201C", "\u201D", "\u201E"]);
const SINGLE_QUOTES = new Set(["'", "\u2018", "\u2019", "\u201A"]);

/** One surrounding pair of straight or curly quotes. Nested quotes stay. */
function unwrapOneQuotePair(value: string): { value: string; unwrapped: boolean } {
  const trimmed = value.trim();
  if (trimmed.length < 2) return { value: trimmed, unwrapped: false };
  const open = trimmed[0];
  const close = trimmed[trimmed.length - 1];
  const pair =
    (DOUBLE_QUOTES.has(open) && DOUBLE_QUOTES.has(close)) ||
    (SINGLE_QUOTES.has(open) && SINGLE_QUOTES.has(close));
  if (!pair) return { value: trimmed, unwrapped: false };
  return { value: trimmed.slice(1, -1).trim(), unwrapped: true };
}

/**
 * Token from an ingest header other than Authorization.
 * Trims, drops one pair of surrounding straight or curly quotes, and drops
 * up to two leading Bearer prefixes. A quote pair inside a Bearer prefix is
 * that one pair when the outside is not quoted.
 */
export function readLooseToken(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const outer = unwrapOneQuotePair(value);
  let token = stripOptionalBearer(stripOptionalBearer(outer.value));
  if (!outer.unwrapped) {
    const inner = unwrapOneQuotePair(token);
    if (inner.unwrapped) token = stripOptionalBearer(stripOptionalBearer(inner.value));
  }
  return token || null;
}

export const RESONANCE_TOKEN_HEADER = "x-resonance-token";
export const FITNESS_TOKEN_HEADER = "x-fitness-token";

/** Extra names a phone may use for the same ingest token. Query and body are not read. */
export const INGEST_TOKEN_HEADER_NAMES = [
  "x-api-key",
  "api-key",
  "apikey",
  "x-auth-token",
  "x-access-token",
  "x-token",
  "token",
  "x-health-token",
] as const;

export const INGEST_AUTH_HEADER_NAMES = [
  "authorization",
  RESONANCE_TOKEN_HEADER,
  FITNESS_TOKEN_HEADER,
  ...INGEST_TOKEN_HEADER_NAMES,
] as const;

export type IngestCredentials = {
  tokens: string[];
  headerNames: string[];
};

/**
 * Credentials from the ingest headers.
 * `headerNames` is the lowercase names that were present. Values are not copied into that list.
 * The URL and the body are not read.
 */
export function readIngestCredentials(headers: { get(name: string): string | null }): IngestCredentials {
  const headerNames: string[] = [];
  const tokens: string[] = [];
  for (const name of INGEST_AUTH_HEADER_NAMES) {
    const raw = headers.get(name);
    if (raw === null || raw.trim() === "") continue;
    headerNames.push(name);
    const token = name === "authorization" ? readAuthorizationCredential(raw) : readLooseToken(raw);
    if (token) tokens.push(token);
  }
  return { tokens, headerNames };
}

export function tokensMatch(provided: string, expected: string): boolean {
  return secretsMatch(provided, expected);
}

function secretsMatch(provided: string, expected: string): boolean {
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

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
 * Any of the presented tokens may match. A match is a constant-time compare.
 */
export function authorizeFitnessAccess(input: {
  token: string | null;
  bearer?: string | null;
  headerToken?: string | null;
  resonanceToken?: string | null;
  presented?: readonly (string | null | undefined)[];
}): FitnessAuthResult {
  if (!input.token) {
    return { ok: false, status: 503, error: "Fitness ingest is not configured." };
  }
  const presented = [input.bearer, input.headerToken, input.resonanceToken, ...(input.presented ?? [])].filter(
    (value): value is string => Boolean(value && value.trim()),
  );
  let accepted = false;
  if (presented.length === 0) {
    secretsMatch(" ", input.token);
  } else {
    for (const value of presented) {
      if (secretsMatch(value, input.token)) accepted = true;
    }
  }
  if (accepted) return { ok: true };
  return {
    ok: false,
    status: 401,
    error: "Send Authorization: Bearer <token>, X-Resonance-Token, or X-Fitness-Token.",
  };
}

export function bearerMatchesSyncSecret(
  authorizationHeader: string | null | undefined,
  env: EnvLike = process.env,
): boolean {
  const secret = getSyncSecret(env);
  const bearer = readBearerToken(authorizationHeader);
  if (!secret || !bearer) return false;
  return secretsMatch(bearer, secret);
}

/**
 * Nightly backup. CRON_SECRET or the sync secret. Closed when both are unset.
 * A backup dumps the database, so an empty env does not leave the route open.
 */
export function authorizeBackupAccess(input: {
  cronSecret: string | null;
  syncSecret: string | null;
  bearer: string | null;
}): { ok: true; via: "cron" | "sync" } | { ok: false; error: string } {
  const { cronSecret, syncSecret, bearer } = input;
  if (bearer && cronSecret && secretsMatch(bearer, cronSecret)) return { ok: true, via: "cron" };
  if (bearer && syncSecret && secretsMatch(bearer, syncSecret)) return { ok: true, via: "sync" };
  return {
    ok: false,
    error: "Send Authorization: Bearer <CRON_SECRET> or the sync secret.",
  };
}

export function bearerMatchesBackupSecret(
  authorizationHeader: string | null | undefined,
  env: EnvLike = process.env,
): boolean {
  return authorizeBackupAccess({
    cronSecret: getCronSecret(env),
    syncSecret: getSyncSecret(env),
    bearer: readBearerToken(authorizationHeader),
  }).ok;
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
