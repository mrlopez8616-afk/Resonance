import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { hash } from "@node-rs/argon2";
import { newDb } from "pg-mem";
import { Secret, TOTP } from "otpauth";
import { POST as postPin } from "@/app/api/settings/owner-pin/route";
import { POST as postMode } from "@/app/api/settings/public-mode/route";
import { SESSION_COOKIE, setAuthClockForTests } from "@/lib/auth-core";
import { createSession } from "@/lib/auth-store";
import {
  PIN_LOCK_MS,
  coarseUserAgent,
  emptyLockout,
  evaluatePinAttempt,
  isPinShape,
  lockoutLabel,
  recordFailure,
} from "@/lib/owner-pin";
import { hashOwnerPin, ownerPinMatches } from "@/lib/owner-pin-hash";
import { listModeLog, readLockout, readOwnerPinHash } from "@/lib/owner-pin-store";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { migrate } from "@/lib/pg/migrate";
import { PUBLIC_MODE_COOKIE } from "@/lib/public-mode";

const TOTP_SECRET = "JBSWY3DPEHPK3PXP";
const PIN = "918273";
const t0 = Date.UTC(2026, 9, 8, 15, 0, 0);

function codeAt(now: number): string {
  return new TOTP({
    secret: Secret.fromBase32(TOTP_SECRET),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  }).generate({ timestamp: now });
}

function memorySql(): SqlClient {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  return {
    async query<T extends Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
      const result = await pool.query(text, [...params]);
      return (result.rows ?? []) as T[];
    },
  };
}

describe("owner pin rules", () => {
  it("hashes with argon2id and verifies only the same PIN", async () => {
    assert.equal(isPinShape("123"), false);
    assert.equal(isPinShape("1234567"), false);
    assert.equal(isPinShape("12ab"), false);
    assert.equal(isPinShape("1234"), true);
    const encoded = await hashOwnerPin(PIN);
    assert.match(encoded, /^\$argon2id\$/);
    assert.notEqual(encoded, PIN);
    assert.equal(await ownerPinMatches(PIN, encoded), true);
    assert.equal(await ownerPinMatches("111111", encoded), false);
    assert.equal(await ownerPinMatches("123", encoded), false);
  });

  it("locks on the third wrong PIN and opens again after 15 minutes", () => {
    let lock = emptyLockout();
    const now = 1_700_000_000_000;
    lock = evaluatePinAttempt({ pinSet: true, shapeValid: true, matches: false, lock, now }).lock;
    assert.equal(lock.failures, 1);
    assert.equal(lock.lockedUntil, null);
    lock = evaluatePinAttempt({ pinSet: true, shapeValid: true, matches: false, lock, now }).lock;
    assert.equal(lock.failures, 2);
    assert.equal(lock.lockedUntil, null);
    const third = evaluatePinAttempt({ pinSet: true, shapeValid: true, matches: false, lock, now });
    assert.equal(third.ok, false);
    if (third.ok) return;
    assert.equal(third.lock.failures, 3);
    assert.equal(third.lock.lockedUntil, now + PIN_LOCK_MS);
    const during = evaluatePinAttempt({
      pinSet: true,
      shapeValid: true,
      matches: true,
      lock: third.lock,
      now: now + PIN_LOCK_MS - 1,
    });
    assert.equal(during.ok, false);
    if (!during.ok) assert.equal(during.reason, "locked");
    assert.equal(during.lock.failures, 3);
    const expired = evaluatePinAttempt({
      pinSet: true,
      shapeValid: true,
      matches: false,
      lock: third.lock,
      now: now + PIN_LOCK_MS,
    });
    assert.equal(expired.ok, false);
    if (expired.ok) return;
    assert.equal(expired.reason, "wrong");
    assert.equal(expired.lock.failures, 1);
    assert.equal(expired.lock.lockedUntil, null);
    assert.equal(lockoutLabel((12 * 60 + 34) * 1000), "Locked · try again in 12:34");
  });

  it("resets the counter when the PIN is correct", () => {
    const now = 5_000;
    let lock = recordFailure(emptyLockout(), now);
    lock = recordFailure(lock, now);
    const attempt = evaluatePinAttempt({ pinSet: true, shapeValid: true, matches: true, lock, now });
    assert.equal(attempt.ok, true);
    assert.equal(attempt.lock.failures, 0);
    assert.equal(attempt.lock.lockedUntil, null);
    const again = evaluatePinAttempt({
      pinSet: true,
      shapeValid: true,
      matches: false,
      lock: attempt.lock,
      now,
    });
    assert.equal(again.lock.failures, 1);
  });

  it("keeps a PIN out of the coarse device label", () => {
    assert.equal(coarseUserAgent(PIN), "Other");
    assert.equal(coarseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), "iPhone");
  });
});

describe("owner pin switch", { concurrency: false }, () => {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_PASSWORD_HASH: process.env.AUTH_PASSWORD_HASH,
    AUTH_TOTP_SECRET: process.env.AUTH_TOTP_SECRET,
    AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
  };
  let now = t0;
  let session = "";

  before(async () => {
    process.env.AUTH_PASSWORD_HASH = await hash("floor-secret");
  });

  after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    setAuthClockForTests(null);
    setSqlClientForTests(null);
  });

  beforeEach(async () => {
    now = t0;
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    process.env.AUTH_TOTP_SECRET = TOTP_SECRET;
    process.env.AUTH_SESSION_SECRET = "session-secret-for-tests";
    setAuthClockForTests(() => now);
    setSqlClientForTests(memorySql());
    await migrate();
    session = await createSession("Mozilla/5.0 (iPhone) Safari/17.0", t0);
  });

  function mode(body: unknown, extra: Record<string, string> = {}) {
    return postMode(
      new Request("https://resonance3.vercel.app/api/settings/public-mode", {
        method: "POST",
        headers: {
          host: "resonance3.vercel.app",
          origin: "https://resonance3.vercel.app",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=${session}`,
          "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
          ...extra,
        },
        body: JSON.stringify(body),
      }),
    );
  }

  function save(body: unknown, extra: Record<string, string> = {}) {
    return postPin(
      new Request("https://resonance3.vercel.app/api/settings/owner-pin", {
        method: "POST",
        headers: {
          host: "resonance3.vercel.app",
          origin: "https://resonance3.vercel.app",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=${session}`,
          "user-agent": PIN,
          ...extra,
        },
        body: JSON.stringify(body),
      }),
    );
  }

  async function textsOf(responses: Response[]): Promise<string> {
    const parts = await Promise.all(responses.map((response) => response.clone().text()));
    return parts.join("\n");
  }

  it("refuses both directions when the request has no PIN", async () => {
    const saved = await save({ pin: PIN, confirm: PIN, totp: codeAt(t0) });
    assert.equal(saved.status, 200);
    const responses = await Promise.all([
      mode({ enabled: true }),
      mode({ enabled: false }),
      mode({ enabled: true, pin: "" }),
      mode({ enabled: false, pin: "" }),
    ]);
    for (const response of responses) {
      assert.notEqual(response.status, 200);
      assert.equal((response.headers.get("set-cookie") ?? "").includes(PUBLIC_MODE_COOKIE), false);
    }
    const dumped = await textsOf([saved, ...responses]);
    assert.equal(dumped.includes(PIN), false);
    const log = await listModeLog();
    assert.equal(JSON.stringify(log).includes(PIN), false);
    assert.equal(log.every((row) => row.outcome === "failure"), true);
    assert.equal(log.some((row) => row.direction === "public"), true);
    assert.equal(log.some((row) => row.direction === "private"), true);
  });

  it("stores the lockout and keeps the PIN out of the log", async () => {
    assert.equal((await save({ pin: PIN, confirm: PIN })).status, 403);
    assert.equal((await save({ pin: PIN, confirm: PIN, totp: codeAt(t0) })).status, 200);
    const hashRow = await readOwnerPinHash();
    assert.match(hashRow ?? "", /^\$argon2id\$/);
    assert.notEqual(hashRow, PIN);

    const responses: Response[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await mode({ enabled: true, pin: "111111" });
      responses.push(response);
      assert.equal(response.status, 403);
    }
    let lock = await readLockout(now);
    assert.equal(lock.failures, 2);
    assert.equal(lock.lockedUntil, null);

    const third = await mode({ enabled: false, pin: "111111" });
    responses.push(third);
    assert.equal(third.status, 423);
    lock = await readLockout(now);
    assert.equal(lock.failures, 3);
    assert.equal(lock.lockedUntil, now + PIN_LOCK_MS);
    const thirdBody = JSON.parse(await third.clone().text()) as { error?: string; retryInSec?: number };
    assert.equal(thirdBody.error, "Locked.");
    assert.equal(thirdBody.retryInSec, 15 * 60);

    const during = await mode({ enabled: true, pin: PIN });
    responses.push(during);
    assert.equal(during.status, 423);
    assert.equal((await readLockout(now)).failures, 3);

    now = t0 + PIN_LOCK_MS;
    const opened = await mode({ enabled: true, pin: PIN });
    responses.push(opened);
    assert.equal(opened.status, 200);
    lock = await readLockout(now);
    assert.equal(lock.failures, 0);
    assert.equal(lock.lockedUntil, null);

    const dumped = await textsOf(responses);
    assert.equal(dumped.includes(PIN), false);
    assert.equal(dumped.includes("111111"), false);
    const log = await listModeLog();
    const packed = JSON.stringify(log);
    assert.equal(packed.includes(PIN), false);
    assert.equal(packed.includes("111111"), false);
    assert.equal(log.some((row) => row.outcome === "success" && row.direction === "public" && row.userAgent === "iPhone"), true);
    assert.equal(log.some((row) => row.outcome === "failure"), true);

    const changed = await save({ current: "0000", pin: "4242", confirm: "4242" });
    assert.equal(changed.status, 403);
    const renamed = await save({ current: PIN, pin: "4242", confirm: "4242" });
    assert.equal(renamed.status, 200);
    const renamedText = await renamed.text();
    assert.equal(renamedText.includes("4242"), false);
    assert.equal(renamedText.includes(PIN), false);
    const again = await migrate();
    assert.equal(again.applied.includes("017_owner_pin"), false);
    assert.equal(again.skipped.includes("017_owner_pin"), true);
    const rows = await sqlQuery<{ id: string }>(`SELECT id FROM schema_migrations WHERE id = '017_owner_pin'`);
    assert.equal(rows.length, 1);
  });

  it("hides PIN changes while public mode is on", async () => {
    assert.equal((await save({ pin: PIN, confirm: PIN, totp: codeAt(t0) })).status, 200);
    const on = await mode({ enabled: true, pin: PIN });
    assert.equal(on.status, 200);
    const blocked = await save(
      { current: PIN, pin: "4242", confirm: "4242" },
      { cookie: `${SESSION_COOKIE}=${session}; ${PUBLIC_MODE_COOKIE}=1` },
    );
    assert.equal(blocked.status, 404);
    assert.equal((await blocked.text()).includes(PIN), false);
  });
});
