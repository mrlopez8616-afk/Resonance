import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { hash } from "@node-rs/argon2";
import { Secret, TOTP } from "otpauth";
import { newDb } from "pg-mem";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as logoutAll } from "@/app/api/auth/logout-all/route";
import {
  IP_MAX_FAILURES,
  SESSION_COOKIE,
  deviceLabel,
  globalLockoutAfterFailure,
  isLoginConfigured,
  isSessionToken,
  newSessionToken,
  openChallenge,
  planAccess,
  requestOrigin,
  safeNextPath,
  sealChallenge,
  setAuthClockForTests,
} from "@/lib/auth-core";
import { authenticatePassword } from "@/lib/auth-login";
import { passwordMatches } from "@/lib/auth-password";
import {
  createSession,
  deleteAllSessions,
  readLiveSession,
} from "@/lib/auth-store";
import { totpMatches } from "@/lib/auth-totp";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { isLoopbackPostgres } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { applyMigrations, migrate } from "@/lib/pg/migrate";

const TOTP_SECRET = "JBSWY3DPEHPK3PXP";
const PASSWORD = "floor-secret";
const HOUR = 60 * 60 * 1000;
const t0 = Date.UTC(2026, 9, 8, 15, 0, 0);

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

function codeAt(now: number, steps = 0): string {
  return new TOTP({
    secret: Secret.fromBase32(TOTP_SECRET),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  }).generate({ timestamp: now + steps * 30_000 });
}

function envSnapshot() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_PASSWORD_HASH: process.env.AUTH_PASSWORD_HASH,
    AUTH_TOTP_SECRET: process.env.AUTH_TOTP_SECRET,
    AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
    RESONANCE_SYNC_SECRET: process.env.RESONANCE_SYNC_SECRET,
  };
}

function restore(previous: ReturnType<typeof envSnapshot>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("login core", { concurrency: false }, () => {
  const previous = envSnapshot();
  let passwordHash = "";

  before(async () => {
    passwordHash = await hash(PASSWORD);
  });

  after(() => {
    restore(previous);
    setAuthClockForTests(null);
    setSqlClientForTests(null);
  });

  beforeEach(async () => {
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    process.env.AUTH_PASSWORD_HASH = passwordHash;
    process.env.AUTH_TOTP_SECRET = TOTP_SECRET;
    process.env.AUTH_SESSION_SECRET = "session-secret-for-tests";
    process.env.RESONANCE_SYNC_SECRET = "hub-secret";
    setAuthClockForTests(() => t0);
    setSqlClientForTests(memorySql());
    await migrate();
  });

  it("checks the authenticator code within one step", () => {
    assert.equal(totpMatches(TOTP_SECRET, codeAt(t0, 0), t0), true);
    assert.equal(totpMatches(TOTP_SECRET, codeAt(t0, -1), t0), true);
    assert.equal(totpMatches(TOTP_SECRET, codeAt(t0, 1), t0), true);
    assert.equal(totpMatches(TOTP_SECRET, codeAt(t0, 2), t0), false);
    assert.equal(totpMatches(TOTP_SECRET, "000000", t0), false);
    assert.equal(totpMatches(TOTP_SECRET, "abcdef", t0), false);
  });

  it("verifies an argon2id password and rejects a mismatch", async () => {
    assert.equal(await passwordMatches(PASSWORD, passwordHash), true);
    assert.equal(await passwordMatches("nope", passwordHash), false);
    assert.equal(passwordHash.startsWith("$argon2id$"), true);
  });

  it("signs in with password and totp, and rejects either factor alone", async () => {
    const good = await authenticatePassword({
      password: PASSWORD,
      code: codeAt(t0),
      ip: "203.0.113.4",
      userAgent: "Mozilla/5.0 Chrome/120.0.0.0",
      now: t0,
    });
    assert.equal(good.ok, true);
    if (!good.ok) return;
    assert.equal(isSessionToken(good.token), true);
    const live = await readLiveSession(good.token, t0 + 1000);
    assert.equal(live?.session.userAgent, "Chrome on Unknown");
    assert.equal(live?.session.username, "andres");
    assert.equal(live?.session.role, "owner");
    assert.match(live?.session.userId ?? "", /^[1-9][0-9]*$/);

    const otherPerson = await authenticatePassword({
      password: PASSWORD,
      code: codeAt(t0),
      username: "carla",
      ip: "203.0.113.7",
      userAgent: null,
      now: t0,
    });
    assert.equal(otherPerson.ok, false);

    await sqlQuery(`UPDATE users SET role = 'operator' WHERE id = $1`, [live?.session.userId]);
    assert.equal(await readLiveSession(good.token, t0 + 1500), null);
    await sqlQuery(`UPDATE users SET role = 'owner' WHERE id = $1`, [live?.session.userId]);

    const badCode = await authenticatePassword({
      password: PASSWORD,
      code: "000000",
      ip: "203.0.113.8",
      userAgent: null,
      now: t0,
    });
    assert.equal(badCode.ok, false);
    if (!badCode.ok) assert.equal(badCode.status, 401);

    const badPassword = await authenticatePassword({
      password: "wrong-password",
      code: codeAt(t0),
      ip: "203.0.113.9",
      userAgent: null,
      now: t0,
    });
    assert.equal(badPassword.ok, false);
  });

  it("locks an address after 5 failures and backs off globally", async () => {
    for (let i = 0; i < IP_MAX_FAILURES; i += 1) {
      const failed = await authenticatePassword({
        password: "wrong-password",
        code: "000000",
        ip: "198.51.100.10",
        userAgent: null,
        now: t0 + i * 1000,
      });
      assert.equal(failed.ok, false);
      if (!failed.ok) assert.equal(failed.status, 401);
    }
    const blocked = await authenticatePassword({
      password: PASSWORD,
      code: codeAt(t0),
      ip: "198.51.100.10",
      userAgent: null,
      now: t0 + 10_000,
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.status, 429);

    const otherAddress = await authenticatePassword({
      password: PASSWORD,
      code: codeAt(t0),
      ip: "198.51.100.99",
      userAgent: null,
      now: t0 + 11_000,
    });
    assert.equal(otherAddress.ok, false);
    if (!otherAddress.ok) assert.equal(otherAddress.status, 429);

    const later = t0 + 16 * 60 * 1000;
    const again = await authenticatePassword({
      password: PASSWORD,
      code: codeAt(later),
      ip: "198.51.100.10",
      userAgent: null,
      now: later,
    });
    assert.equal(again.ok, true);
  });

  it("doubles the global backoff", () => {
    const first = globalLockoutAfterFailure({ failures: 4, backoffSec: 60 }, t0);
    assert.equal(first.failures, 5);
    assert.equal(first.lockedUntil, t0 + 60_000);
    assert.equal(first.backoffSec, 120);
    const second = globalLockoutAfterFailure({ failures: 9, backoffSec: first.backoffSec }, t0);
    assert.equal(second.backoffSec, 240);
    assert.equal(second.lockedUntil, t0 + 120_000);
  });

  it("creates, renews, expires, and clears every session", async () => {
    const first = await createSession("Mozilla/5.0 (Macintosh) Chrome/120.0.0.0", t0);
    const second = await createSession("Mozilla/5.0 (X11; Linux) Firefox/120.0", t0);
    assert.equal(deviceLabel("Mozilla/5.0 (Macintosh) Chrome/120.0.0.0"), "Chrome on macOS");
    const fresh = await readLiveSession(first, t0 + HOUR);
    assert.equal(fresh?.resetCookie, false);

    const renewed = await readLiveSession(first, t0 + 25 * HOUR);
    assert.equal(renewed?.resetCookie, true);
    assert.equal(
      new Date(renewed?.session.expiresAt ?? 0).getTime(),
      t0 + 25 * HOUR + 30 * 24 * HOUR,
    );

    const expired = await readLiveSession(second, t0 + 31 * 24 * HOUR);
    assert.equal(expired, null);
    const gone = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM auth_sessions WHERE user_agent LIKE 'Firefox%'`,
    );
    assert.equal(Number(gone[0]?.n), 0);

    const third = await createSession("Mozilla/5.0 Chrome/120.0.0.0", t0);
    await deleteAllSessions();
    assert.equal(await readLiveSession(first, t0 + 26 * HOUR), null);
    assert.equal(await readLiveSession(third, t0 + 1000), null);
  });

  it("sets and clears the session cookie from the login routes", async () => {
    const response = await login(
      new Request("https://resonance3.vercel.app/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 Chrome/120.0.0.0" },
        body: JSON.stringify({ password: PASSWORD, code: codeAt(t0) }),
      }),
    );
    assert.equal(response.status, 200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    assert.match(setCookie, new RegExp(`${SESSION_COOKIE}=`));
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Path=\//);
    assert.match(setCookie, /Max-Age=2592000/);
    const token = /__Host-resonance_session=([^;]+)/.exec(setCookie)?.[1] ?? "";
    assert.equal(isSessionToken(token), true);

    const signedOut = await logout(
      new Request("https://resonance3.vercel.app/api/auth/logout", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      }),
    );
    assert.equal(signedOut.status, 303);
    assert.match(signedOut.headers.get("set-cookie") ?? "", /Max-Age=0/);
    assert.equal(await readLiveSession(token, t0 + 1000), null);

    const kept = await createSession("Mozilla/5.0 Chrome/120.0.0.0", t0);
    const other = await createSession("Mozilla/5.0 Firefox/120.0", t0);
    const everywhere = await logoutAll(
      new Request("https://resonance3.vercel.app/api/auth/logout-all", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=${kept}` },
      }),
    );
    assert.equal(everywhere.status, 303);
    assert.equal(everywhere.headers.get("location"), "https://resonance3.vercel.app/login");
    const localSignOut = await logout(
      new Request("http://0.0.0.0:3001/api/auth/logout", {
        method: "POST",
        headers: { host: "localhost:3001", cookie: `${SESSION_COOKIE}=${kept}` },
      }),
    );
    assert.equal(localSignOut.headers.get("location"), "http://localhost:3001/login");
    assert.equal(
      requestOrigin(new Request("http://0.0.0.0:3001/", { headers: { host: "localhost:3001" } })),
      "http://localhost:3001",
    );
    assert.equal(await readLiveSession(kept, t0 + 2000), null);
    assert.equal(await readLiveSession(other, t0 + 2000), null);
  });

  it("fails closed when the password hash or totp secret is missing", async () => {
    delete process.env.AUTH_PASSWORD_HASH;
    assert.equal(isLoginConfigured(), false);
    const closed = await authenticatePassword({
      password: PASSWORD,
      code: codeAt(t0),
      ip: "203.0.113.4",
      userAgent: null,
      now: t0,
    });
    assert.equal(closed.ok, false);
    if (!closed.ok) assert.equal(closed.status, 401);

    process.env.AUTH_PASSWORD_HASH = passwordHash;
    delete process.env.AUTH_TOTP_SECRET;
    const noTotp = await login(
      new Request("https://resonance3.vercel.app/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: PASSWORD, code: codeAt(t0) }),
      }),
    );
    assert.equal(noTotp.status, 401);
    assert.equal((await noTotp.json()).error, "Login is not configured.");
  });

  it("seals a passkey challenge and rejects a tampered token", () => {
    const sealed = sealChallenge(
      { challenge: "abc", kind: "register" },
      "session-secret-for-tests",
      t0,
    );
    assert.deepEqual(openChallenge(sealed, "session-secret-for-tests", t0), {
      challenge: "abc",
      kind: "register",
    });
    assert.equal(openChallenge(`${sealed}x`, "session-secret-for-tests", t0), null);
    assert.equal(openChallenge(sealed, "other-secret", t0), null);
    assert.equal(openChallenge(sealed, "session-secret-for-tests", t0 + 6 * 60 * 1000), null);
  });

  it("plans the proxy allowlist", () => {
    const base = {
      sessionToken: null as string | null,
      bearerOk: false,
      loginConfigured: true,
    };
    assert.equal(planAccess({ ...base, pathname: "/login", method: "GET", nextPath: "/login" }).kind, "allow");
    assert.equal(
      planAccess({ ...base, pathname: "/api/auth/login", method: "POST", nextPath: "/api/auth/login" }).kind,
      "allow",
    );
    assert.equal(
      planAccess({ ...base, pathname: "/_next/static/chunk.js", method: "GET", nextPath: "/" }).kind,
      "allow",
    );
    assert.equal(planAccess({ ...base, pathname: "/favicon.ico", method: "GET", nextPath: "/" }).kind, "allow");
    assert.equal(planAccess({ ...base, pathname: "/robots.txt", method: "GET", nextPath: "/" }).kind, "allow");
    assert.equal(planAccess({ ...base, pathname: "/icons/mark.png", method: "GET", nextPath: "/" }).kind, "allow");

    const home = planAccess({ ...base, pathname: "/", method: "GET", nextPath: "/" });
    assert.deepEqual(home, { kind: "redirect", next: "/" });
    const fights = planAccess({ ...base, pathname: "/fights", method: "GET", nextPath: "/fights" });
    assert.deepEqual(fights, { kind: "redirect", next: "/fights" });
    const predictions = planAccess({
      ...base,
      pathname: "/n/predictions",
      method: "GET",
      nextPath: "/n/predictions",
    });
    assert.deepEqual(predictions, { kind: "redirect", next: "/n/predictions" });

    assert.equal(
      planAccess({ ...base, pathname: "/api/bets", method: "GET", nextPath: "/api/bets" }).kind,
      "deny",
    );
    assert.equal(
      planAccess({
        ...base,
        pathname: "/api/fights/breakdown",
        method: "GET",
        nextPath: "/api/fights/breakdown",
      }).kind,
      "deny",
    );
    assert.equal(
      planAccess({ ...base, pathname: "/api/bets", method: "GET", nextPath: "/api/bets", bearerOk: true }).kind,
      "allow",
    );
    assert.equal(
      planAccess({ ...base, pathname: "/api/bets", method: "POST", nextPath: "/api/bets" }).kind,
      "allow",
    );
    assert.equal(
      planAccess({
        ...base,
        pathname: "/api/fights/breakdown",
        method: "POST",
        nextPath: "/api/fights/breakdown",
      }).kind,
      "allow",
    );
    assert.equal(
      planAccess({ ...base, pathname: "/api/fitness/ingest", method: "POST", nextPath: "/api/fitness/ingest" }).kind,
      "allow",
    );

    const token = newSessionToken();
    assert.equal(
      planAccess({
        ...base,
        pathname: "/api/bets",
        method: "GET",
        nextPath: "/api/bets",
        sessionToken: token,
      }).kind,
      "allow-session",
    );
    assert.equal(
      planAccess({
        ...base,
        loginConfigured: false,
        pathname: "/",
        method: "GET",
        nextPath: "/",
        sessionToken: token,
      }).kind,
      "redirect",
    );
    assert.equal(
      planAccess({
        ...base,
        loginConfigured: false,
        pathname: "/api/bets",
        method: "GET",
        nextPath: "/api/bets",
        sessionToken: token,
      }).kind,
      "deny",
    );
    assert.equal(safeNextPath("https://evil.example"), "/");
    assert.equal(safeNextPath("//evil.example"), "/");
    assert.equal(safeNextPath("/fights"), "/fights");
  });

  it("applies 001 through 005 and 009 in order and still fills a gap", async () => {
    assert.deepEqual(
      EMBEDDED_MIGRATIONS.map((migration) => migration.id),
      [
        "001_domain_tables",
        "002_fitness",
        "003_bet_tier",
        "004_fight_breakdowns",
        "005_auth",
        "009_reset_rh_agentic_sleeves",
      ],
    );
    const ids = (await sqlQuery<{ id: string }>(`SELECT id FROM schema_migrations ORDER BY id`)).map(
      (row) => row.id,
    );
    assert.deepEqual(ids, EMBEDDED_MIGRATIONS.map((migration) => migration.id));

    setSqlClientForTests(memorySql());
    const without004 = EMBEDDED_MIGRATIONS.filter((migration) => migration.id !== "004_fight_breakdowns");
    const gapped = await applyMigrations(without004);
    assert.deepEqual(
      gapped.applied,
      without004.map((migration) => migration.id),
    );
    const filled = await applyMigrations(EMBEDDED_MIGRATIONS);
    assert.deepEqual(filled.applied, ["004_fight_breakdowns"]);
    assert.equal(filled.skipped.includes("005_auth"), true);
  });

  it("treats only loopback urls as local postgres", () => {
    assert.equal(isLoopbackPostgres("postgres://resonance@127.0.0.1:5432/resonance"), true);
    assert.equal(isLoopbackPostgres("postgres://resonance@localhost/resonance"), true);
    assert.equal(isLoopbackPostgres("postgres://user:pass@ep-example.neon.tech/neondb"), false);
  });
});
