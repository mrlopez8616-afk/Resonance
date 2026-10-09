/** Public/private switch PIN. Pure checks. Hashing lives in owner-pin-hash.ts. */

export const PIN_LOCK_FAILURES = 3;
export const PIN_LOCK_MS = 15 * 60 * 1000;

const COARSE_AGENTS = ["iPhone", "iPad", "Android", "Mobile", "Mac", "Windows", "Linux", "Other"] as const;

export type CoarseAgent = (typeof COARSE_AGENTS)[number];
export type ModeDirection = "public" | "private";
export type ModeOutcome = "success" | "failure";

export type LockoutState = {
  failures: number;
  lockedUntil: number | null;
};

export type PinAttempt =
  | { ok: true; lock: LockoutState }
  | { ok: false; reason: "locked" | "unset" | "invalid" | "wrong"; lock: LockoutState };

export type PublicModeClientStatus = {
  pinSet: boolean;
  lockedUntil: string | null;
  unavailable: boolean;
};

export type ModeLogRow = {
  id: string;
  at: string;
  direction: ModeDirection;
  outcome: ModeOutcome;
  userAgent: CoarseAgent;
};

export function isPinShape(value: string): boolean {
  return /^\d{4,6}$/.test(value);
}

export function emptyLockout(): LockoutState {
  return { failures: 0, lockedUntil: null };
}

export function normalizeLockout(state: LockoutState, now: number): LockoutState {
  if (state.lockedUntil !== null && state.lockedUntil <= now) return emptyLockout();
  return { failures: state.failures, lockedUntil: state.lockedUntil };
}

export function isLocked(state: LockoutState, now: number): boolean {
  return normalizeLockout(state, now).lockedUntil !== null;
}

export function recordFailure(state: LockoutState, now: number): LockoutState {
  const current = normalizeLockout(state, now);
  if (current.lockedUntil !== null) return current;
  const failures = current.failures + 1;
  if (failures >= PIN_LOCK_FAILURES) {
    return { failures, lockedUntil: now + PIN_LOCK_MS };
  }
  return { failures, lockedUntil: null };
}

/** A correct PIN clears the counter. A locked switch does not accept it. */
export function evaluatePinAttempt(input: {
  pinSet: boolean;
  shapeValid: boolean;
  matches: boolean;
  lock: LockoutState;
  now: number;
}): PinAttempt {
  const lock = normalizeLockout(input.lock, input.now);
  if (lock.lockedUntil !== null) return { ok: false, reason: "locked", lock };
  if (!input.pinSet) return { ok: false, reason: "unset", lock };
  if (!input.shapeValid) return { ok: false, reason: "invalid", lock };
  if (!input.matches) return { ok: false, reason: "wrong", lock: recordFailure(lock, input.now) };
  return { ok: true, lock: emptyLockout() };
}

export function lockoutRemainingMs(lockedUntil: number | null, now: number): number {
  if (lockedUntil === null) return 0;
  return Math.max(0, lockedUntil - now);
}

export function formatLockoutClock(remainingMs: number): string {
  const totalSeconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function lockoutLabel(remainingMs: number): string {
  return `Locked · try again in ${formatLockoutClock(remainingMs)}`;
}

/** Device class only. The raw header is not stored, so a PIN in it cannot land in the log. */
export function coarseUserAgent(header: string | null | undefined): CoarseAgent {
  const value = header ?? "";
  if (/iPhone/i.test(value)) return "iPhone";
  if (/iPad/i.test(value)) return "iPad";
  if (/Android/i.test(value)) return "Android";
  if (/Mobile/i.test(value)) return "Mobile";
  if (/Macintosh|Mac OS/i.test(value)) return "Mac";
  if (/Windows/i.test(value)) return "Windows";
  if (/Linux/i.test(value)) return "Linux";
  return "Other";
}

export function isCoarseAgent(value: string): value is CoarseAgent {
  return (COARSE_AGENTS as readonly string[]).includes(value);
}
