import { sqlQuery } from "@/lib/pg/client";
import { isStorageUnavailable } from "@/lib/storage-unavailable";
import { bearerMatchesSyncSecret } from "@/lib/sync-auth-core";
import {
  GLOBAL_BACKOFF_START_SEC,
  IP_MAX_FAILURES,
  IP_WINDOW_MS,
  OWNER_USERNAME,
  SESSION_MS,
  authNow,
  deviceLabel,
  globalLockoutAfterFailure,
  hashIp,
  hashSessionId,
  isLoginConfigured,
  isSessionToken,
  needsRenewal,
  newSessionToken,
  type UserRole,
} from "@/lib/auth-core";

export type AuthSession = {
  idHash: string;
  userId: string;
  username: string;
  role: UserRole;
  createdAt: string;
  lastSeenAt: string;
  renewedAt: string;
  expiresAt: string;
  userAgent: string;
};

export type LiveSession = {
  token: string;
  session: AuthSession;
  resetCookie: boolean;
};

type SessionRow = {
  id_hash: string;
  user_id: number | string;
  username: string;
  role: string;
  disabled_at: string | Date | null;
  created_at: string | Date;
  last_seen_at: string | Date;
  renewed_at: string | Date;
  expires_at: string | Date;
  user_agent: string;
};

type LockRow = {
  failures: number | string;
  backoff_sec: number | string;
  locked_until: string | Date | null;
};

function iso(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function millis(value: string | Date | null | undefined): number {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return date.getTime();
}

function stamp(now: number): string {
  return new Date(now).toISOString();
}

function asRole(value: string): UserRole | null {
  return value === "owner" || value === "operator" ? value : null;
}

/** Inserts the env-backed owner when missing. Secrets stay in the environment. */
export async function ensureOwner(now = authNow()): Promise<{ id: string }> {
  const load = () =>
    sqlQuery<{ id: number | string; role: string; disabled_at: string | Date | null }>(
      `SELECT id, role, disabled_at FROM users WHERE username = $1`,
      [OWNER_USERNAME],
    );
  const existing = await load();
  const row = existing[0];
  if (row) {
    if (row.role !== "owner" || row.disabled_at) throw new Error("Owner account is not available.");
    return { id: String(row.id) };
  }
  try {
    const inserted = await sqlQuery<{ id: number | string }>(
      `INSERT INTO users (username, role, created_at) VALUES ($1, 'owner', $2) RETURNING id`,
      [OWNER_USERNAME, stamp(now)],
    );
    const id = inserted[0]?.id;
    if (id !== undefined) return { id: String(id) };
  } catch {
    const again = await load();
    if (again[0]?.role === "owner" && !again[0].disabled_at) return { id: String(again[0].id) };
  }
  throw new Error("Owner account was not created.");
}

export async function readLiveSession(token: string, now = authNow()): Promise<LiveSession | null> {
  if (!isLoginConfigured() || !isSessionToken(token)) return null;
  const idHash = hashSessionId(token);
  const rows = await sqlQuery<SessionRow>(
    `SELECT s.id_hash, s.user_id, u.username, u.role, u.disabled_at,
            s.created_at, s.last_seen_at, s.renewed_at, s.expires_at, s.user_agent
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id_hash = $1`,
    [idHash],
  );
  const row = rows[0];
  if (!row) return null;
  const role = asRole(row.role);
  if (millis(row.expires_at) <= now || !role || role !== "owner" || row.disabled_at) {
    await sqlQuery(`DELETE FROM auth_sessions WHERE id_hash = $1`, [idHash]);
    return null;
  }
  const seen = stamp(now);
  const resetCookie = needsRenewal(millis(row.renewed_at), now);
  const expires = resetCookie ? stamp(now + SESSION_MS) : iso(row.expires_at);
  if (resetCookie) {
    await sqlQuery(
      `UPDATE auth_sessions
       SET last_seen_at = $2, renewed_at = $2, expires_at = $3
       WHERE id_hash = $1`,
      [idHash, seen, expires],
    );
  } else {
    await sqlQuery(`UPDATE auth_sessions SET last_seen_at = $2 WHERE id_hash = $1`, [idHash, seen]);
  }
  return {
    token,
    resetCookie,
    session: {
      idHash,
      userId: String(row.user_id),
      username: row.username,
      role,
      createdAt: iso(row.created_at),
      lastSeenAt: seen,
      renewedAt: resetCookie ? seen : iso(row.renewed_at),
      expiresAt: expires,
      userAgent: row.user_agent,
    },
  };
}

export async function createSession(userAgent: string | null, now = authNow()): Promise<string> {
  const owner = await ensureOwner(now);
  const token = newSessionToken();
  const idHash = hashSessionId(token);
  const seen = stamp(now);
  await sqlQuery(
    `INSERT INTO auth_sessions
       (id_hash, user_id, created_at, last_seen_at, renewed_at, expires_at, user_agent)
     VALUES ($1, $2, $3, $3, $3, $4, $5)`,
    [idHash, owner.id, seen, stamp(now + SESSION_MS), deviceLabel(userAgent)],
  );
  return token;
}

export async function deleteSession(token: string | null): Promise<void> {
  if (!token || !isSessionToken(token) || !isLoginConfigured()) return;
  await sqlQuery(`DELETE FROM auth_sessions WHERE id_hash = $1`, [hashSessionId(token)]);
}

export async function deleteAllSessions(): Promise<void> {
  await sqlQuery(`DELETE FROM auth_sessions`);
}

export type SessionView = {
  label: string;
  lastSeen: string;
  created: string;
  current: boolean;
};

export async function listSessionViews(currentHash: string | null): Promise<SessionView[]> {
  const rows = await sqlQuery<SessionRow>(
    `SELECT id_hash, created_at, last_seen_at, renewed_at, expires_at, user_agent
     FROM auth_sessions ORDER BY last_seen_at DESC`,
  );
  return rows.map((row) => ({
    label: row.user_agent,
    lastSeen: iso(row.last_seen_at),
    created: iso(row.created_at),
    current: currentHash !== null && row.id_hash === currentHash,
  }));
}

export type PasskeyRecord = {
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
  deviceLabel: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type PasskeyRow = {
  credential_id: string;
  public_key: string;
  counter: number | string;
  transports: string | null;
  device_label: string;
  created_at: string | Date;
  last_used_at: string | Date | null;
};

function mapPasskey(row: PasskeyRow): PasskeyRecord {
  return {
    credentialId: row.credential_id,
    publicKey: row.public_key,
    counter: Number(row.counter),
    transports: row.transports ? row.transports.split(",").filter(Boolean) : [],
    deviceLabel: row.device_label,
    createdAt: iso(row.created_at),
    lastUsedAt: row.last_used_at ? iso(row.last_used_at) : null,
  };
}

export async function listPasskeys(): Promise<PasskeyRecord[]> {
  const rows = await sqlQuery<PasskeyRow>(
    `SELECT credential_id, public_key, counter, transports, device_label, created_at, last_used_at
     FROM auth_passkeys ORDER BY created_at DESC`,
  );
  return rows.map(mapPasskey);
}

export async function passkeyCount(): Promise<number> {
  const rows = await sqlQuery<{ n: number | string }>(`SELECT count(*)::text AS n FROM auth_passkeys`);
  return Number(rows[0]?.n ?? 0);
}

export async function insertPasskey(input: {
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
  deviceLabel: string;
  now?: number;
}): Promise<void> {
  const now = input.now ?? authNow();
  await sqlQuery(
    `INSERT INTO auth_passkeys
       (credential_id, public_key, counter, transports, device_label, created_at, last_used_at)
     VALUES ($1, $2, $3, $4, $5, $6, NULL)`,
    [
      input.credentialId,
      input.publicKey,
      input.counter,
      input.transports.join(","),
      input.deviceLabel,
      stamp(now),
    ],
  );
}

export async function deletePasskey(credentialId: string): Promise<void> {
  await sqlQuery(`DELETE FROM auth_passkeys WHERE credential_id = $1`, [credentialId]);
}

export async function getPasskey(credentialId: string): Promise<PasskeyRecord | null> {
  const rows = await sqlQuery<PasskeyRow>(
    `SELECT credential_id, public_key, counter, transports, device_label, created_at, last_used_at
     FROM auth_passkeys WHERE credential_id = $1`,
    [credentialId],
  );
  return rows[0] ? mapPasskey(rows[0]) : null;
}

export async function touchPasskey(credentialId: string, counter: number, now = authNow()): Promise<void> {
  await sqlQuery(
    `UPDATE auth_passkeys SET counter = $2, last_used_at = $3 WHERE credential_id = $1`,
    [credentialId, counter, stamp(now)],
  );
}

async function pruneAttempts(now: number): Promise<void> {
  await sqlQuery(`DELETE FROM auth_login_attempts WHERE failed_at <= $1`, [
    stamp(now - IP_WINDOW_MS),
  ]);
}

async function readLockout(): Promise<LockRow | null> {
  const rows = await sqlQuery<LockRow>(
    `SELECT failures, backoff_sec, locked_until FROM auth_global_lockout WHERE id = 1`,
  );
  return rows[0] ?? null;
}

async function ensureLockout(now: number): Promise<LockRow> {
  const existing = await readLockout();
  if (existing) return existing;
  await sqlQuery(
    `INSERT INTO auth_global_lockout (id, failures, locked_until, backoff_sec, updated_at)
     VALUES (1, 0, NULL, $1, $2)`,
    [GLOBAL_BACKOFF_START_SEC, stamp(now)],
  );
  return { failures: 0, backoff_sec: GLOBAL_BACKOFF_START_SEC, locked_until: null };
}

export async function loginAllowed(
  ip: string,
  now = authNow(),
): Promise<{ ok: true } | { ok: false }> {
  await pruneAttempts(now);
  const lock = await readLockout();
  if (lock && millis(lock.locked_until) > now) return { ok: false };
  const rows = await sqlQuery<{ n: number | string }>(
    `SELECT count(*)::text AS n FROM auth_login_attempts WHERE ip_hash = $1`,
    [hashIp(ip)],
  );
  if (Number(rows[0]?.n ?? 0) >= IP_MAX_FAILURES) return { ok: false };
  return { ok: true };
}

export async function recordLoginFailure(ip: string, now = authNow()): Promise<void> {
  await sqlQuery(`INSERT INTO auth_login_attempts (ip_hash, failed_at) VALUES ($1, $2)`, [
    hashIp(ip),
    stamp(now),
  ]);
  await pruneAttempts(now);
  const lock = await ensureLockout(now);
  const next = globalLockoutAfterFailure(
    { failures: Number(lock.failures), backoffSec: Number(lock.backoff_sec) },
    now,
  );
  await sqlQuery(
    `UPDATE auth_global_lockout
     SET failures = $1, locked_until = $2, backoff_sec = $3, updated_at = $4
     WHERE id = 1`,
    [next.failures, next.lockedUntil ? stamp(next.lockedUntil) : null, next.backoffSec, stamp(now)],
  );
}

export async function clearLoginFailures(ip: string, now = authNow()): Promise<void> {
  await sqlQuery(`DELETE FROM auth_login_attempts WHERE ip_hash = $1`, [hashIp(ip)]);
  const lock = await readLockout();
  if (!lock) return;
  await sqlQuery(
    `UPDATE auth_global_lockout
     SET failures = 0, locked_until = NULL, backoff_sec = $1, updated_at = $2
     WHERE id = 1`,
    [GLOBAL_BACKOFF_START_SEC, stamp(now)],
  );
}

export type PresentedAccess =
  | { ok: true; via: "session"; resetCookie: boolean; token: string }
  | { ok: true; via: "bearer"; resetCookie: false; token: null }
  | { ok: false; status: 401; error: string };

const unauthorized = { ok: false as const, status: 401 as const, error: "Unauthorized." };

/** Session or hub Bearer. A missing login config does not honor a cookie. */
export async function authorizePresentedCredentials(input: {
  cookieToken: string | null;
  authorization: string | null;
}): Promise<PresentedAccess> {
  if (bearerMatchesSyncSecret(input.authorization)) {
    return { ok: true, via: "bearer", resetCookie: false, token: null };
  }
  if (!isLoginConfigured() || !isSessionToken(input.cookieToken)) return unauthorized;
  try {
    const live = await readLiveSession(input.cookieToken);
    if (!live) return unauthorized;
    return { ok: true, via: "session", resetCookie: live.resetCookie, token: live.token };
  } catch (error) {
    if (isStorageUnavailable(error)) return unauthorized;
    throw error;
  }
}
