import "server-only";

import { authNow } from "@/lib/auth-core";
import { hashOwnerPin, ownerPinMatches } from "@/lib/owner-pin-hash";
import {
  emptyLockout,
  evaluatePinAttempt,
  isPinShape,
  normalizeLockout,
  type CoarseAgent,
  type LockoutState,
  type ModeDirection,
  type ModeLogRow,
  type ModeOutcome,
  type PinAttempt,
  type PublicModeClientStatus,
} from "@/lib/owner-pin";
import { sqlQuery } from "@/lib/pg/client";

export type { ModeLogRow };

function epoch(value: unknown): number | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

function stamp(now: number): string {
  return new Date(now).toISOString();
}

export async function readOwnerPinHash(): Promise<string | null> {
  const rows = await sqlQuery<{ pin_hash: string }>(
    `SELECT pin_hash FROM owner_pin WHERE id = 1`,
  );
  const hash = rows[0]?.pin_hash;
  return typeof hash === "string" && hash.startsWith("$argon2id$") ? hash : null;
}

export async function writeOwnerPinHash(pinHash: string, now: number): Promise<void> {
  if (!pinHash.startsWith("$argon2id$")) throw new Error("PIN hash must be argon2id.");
  await sqlQuery(
    `INSERT INTO owner_pin (id, pin_hash, updated_at)
     VALUES (1, $1, $2)
     ON CONFLICT (id) DO UPDATE
     SET pin_hash = EXCLUDED.pin_hash,
         updated_at = EXCLUDED.updated_at`,
    [pinHash, stamp(now)],
  );
}

export async function readLockout(now: number): Promise<LockoutState> {
  const rows = await sqlQuery<{ failures: number | string; locked_until: unknown }>(
    `SELECT failures, locked_until FROM mode_switch_lockout WHERE id = 1`,
  );
  const row = rows[0];
  if (!row) return emptyLockout();
  const failures = Number(row.failures);
  return normalizeLockout(
    {
      failures: Number.isFinite(failures) && failures > 0 ? Math.floor(failures) : 0,
      lockedUntil: epoch(row.locked_until),
    },
    now,
  );
}

export async function writeLockout(state: LockoutState, now: number): Promise<void> {
  await sqlQuery(
    `INSERT INTO mode_switch_lockout (id, failures, locked_until, updated_at)
     VALUES (1, $1, $2, $3)
     ON CONFLICT (id) DO UPDATE
     SET failures = EXCLUDED.failures,
         locked_until = EXCLUDED.locked_until,
         updated_at = EXCLUDED.updated_at`,
    [state.failures, state.lockedUntil === null ? null : stamp(state.lockedUntil), stamp(now)],
  );
}

/**
 * Checks the PIN and updates the lockout row.
 * The return value has no PIN and no hash.
 */
export async function checkOwnerPin(pin: string, now = authNow()): Promise<PinAttempt> {
  const [pinHash, lock] = await Promise.all([readOwnerPinHash(), readLockout(now)]);
  const shapeValid = isPinShape(pin);
  const matches = shapeValid && pinHash ? await ownerPinMatches(pin, pinHash) : false;
  const attempt = evaluatePinAttempt({
    pinSet: pinHash !== null,
    shapeValid,
    matches,
    lock,
    now,
  });
  if (
    attempt.lock.failures !== lock.failures ||
    attempt.lock.lockedUntil !== lock.lockedUntil ||
    attempt.ok
  ) {
    await writeLockout(attempt.lock, now);
  }
  return attempt;
}

export async function saveNewOwnerPin(pin: string, now = authNow()): Promise<void> {
  const pinHash = await hashOwnerPin(pin);
  await writeOwnerPinHash(pinHash, now);
  await writeLockout(emptyLockout(), now);
}

export async function appendModeLog(entry: {
  at: number;
  direction: ModeDirection;
  outcome: ModeOutcome;
  userAgent: CoarseAgent;
}): Promise<void> {
  await sqlQuery(
    `INSERT INTO mode_change_log (changed_at, direction, outcome, user_agent)
     VALUES ($1, $2, $3, $4)`,
    [stamp(entry.at), entry.direction, entry.outcome, entry.userAgent],
  );
}

export async function listModeLog(limit = 40): Promise<ModeLogRow[]> {
  const rows = await sqlQuery<{
    id: number | string;
    changed_at: unknown;
    direction: string;
    outcome: string;
    user_agent: string;
  }>(
    `SELECT id, changed_at, direction, outcome, user_agent
     FROM mode_change_log
     ORDER BY id DESC
     LIMIT $1`,
    [limit],
  );
  return rows.flatMap((row) => {
    const at = epoch(row.changed_at);
    if (at === null) return [];
    if (row.direction !== "public" && row.direction !== "private") return [];
    if (row.outcome !== "success" && row.outcome !== "failure") return [];
    if (
      row.user_agent !== "iPhone" &&
      row.user_agent !== "iPad" &&
      row.user_agent !== "Android" &&
      row.user_agent !== "Mobile" &&
      row.user_agent !== "Mac" &&
      row.user_agent !== "Windows" &&
      row.user_agent !== "Linux" &&
      row.user_agent !== "Other"
    ) {
      return [];
    }
    return [
      {
        id: String(row.id),
        at: new Date(at).toISOString(),
        direction: row.direction,
        outcome: row.outcome,
        userAgent: row.user_agent,
      },
    ];
  });
}

export async function loadModeSwitchStatus(now = authNow()): Promise<PublicModeClientStatus> {
  const [pinHash, lock] = await Promise.all([readOwnerPinHash(), readLockout(now)]);
  return {
    pinSet: pinHash !== null,
    lockedUntil: lock.lockedUntil === null ? null : new Date(lock.lockedUntil).toISOString(),
    unavailable: false,
  };
}
