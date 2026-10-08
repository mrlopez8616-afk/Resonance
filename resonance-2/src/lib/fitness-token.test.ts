import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import { Secret, TOTP } from "otpauth";
import { hash } from "@node-rs/argon2";
import { POST } from "@/app/api/settings/fitness-token/route";
import { SESSION_COOKIE, setAuthClockForTests } from "@/lib/auth-core";
import { createSession } from "@/lib/auth-store";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { migrate } from "@/lib/pg/migrate";
import { newDb } from "pg-mem";

const TOTP_SECRET = "JBSWY3DPEHPK3PXP";
const TOKEN = "fake-fitness-token-value";
const t0 = Date.UTC(2026, 9, 8, 15, 0, 0);
const ENDPOINT = "https://resonance3.vercel.app/api/settings/fitness-token";

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

function codeAt(now: number): string {
  return new TOTP({
    secret: Secret.fromBase32(TOTP_SECRET),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  }).generate({ timestamp: now });
}

function envSnapshot() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_PASSWORD_HASH: process.env.AUTH_PASSWORD_HASH,
    AUTH_TOTP_SECRET: process.env.AUTH_TOTP_SECRET,
    AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
    RESONANCE_SYNC_SECRET: process.env.RESONANCE_SYNC_SECRET,
    FITNESS_INGEST_TOKEN: process.env.FITNESS_INGEST_TOKEN,
  };
}

function restore(previous: ReturnType<typeof envSnapshot>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function post(headers: Record<string, string>, code: string) {
  return POST(
    new Request(ENDPOINT, {
      method: "POST",
      headers: {
        host: "resonance3.vercel.app",
        origin: "https://resonance3.vercel.app",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify({ code }),
    }),
  );
}

describe("fitness sync token", { concurrency: false }, () => {
  const previous = envSnapshot();
  let session = "";

  before(async () => {
    process.env.AUTH_PASSWORD_HASH = await hash("floor-secret");
  });

  after(() => {
    restore(previous);
    setAuthClockForTests(null);
    setSqlClientForTests(null);
  });

  beforeEach(async () => {
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    process.env.AUTH_TOTP_SECRET = TOTP_SECRET;
    process.env.AUTH_SESSION_SECRET = "session-secret-for-tests";
    process.env.RESONANCE_SYNC_SECRET = "hub-secret";
    process.env.FITNESS_INGEST_TOKEN = TOKEN;
    setAuthClockForTests(() => t0);
    setSqlClientForTests(memorySql());
    await migrate();
    session = await createSession("Mozilla/5.0 (iPhone) Safari/17.0", t0);
  });

  it("returns the token to the owner with a valid code and no-store", async () => {
    const logs: unknown[][] = [];
    const originals = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };
    for (const key of Object.keys(originals) as (keyof typeof originals)[]) {
      console[key] = (...args: unknown[]) => {
        logs.push(args);
      };
    }
    try {
      const response = await post({ cookie: `${SESSION_COOKIE}=${session}` }, codeAt(t0));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const body = (await response.json()) as { ok: boolean; token?: string };
      assert.equal(body.ok, true);
      assert.equal(body.token, TOKEN);
      assert.equal(JSON.stringify(logs).includes(TOKEN), false);
    } finally {
      Object.assign(console, originals);
    }
  });

  it("returns 401 for a bad authenticator code", async () => {
    const response = await post({ cookie: `${SESSION_COOKIE}=${session}` }, "000000");
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const text = await response.text();
    assert.equal(text.includes(TOKEN), false);
  });

  it("rejects no session, the bearer, the fitness header, and an operator", async () => {
    const anonymous = await post({}, codeAt(t0));
    assert.equal(anonymous.status, 401);

    const bearer = await post({ authorization: "Bearer hub-secret" }, codeAt(t0));
    assert.equal(bearer.status, 401);
    assert.equal((await bearer.text()).includes(TOKEN), false);

    const header = await post({ "x-fitness-token": TOKEN }, codeAt(t0));
    assert.equal(header.status, 401);
    assert.equal((await header.text()).includes(TOKEN), false);

    await sqlQuery(`UPDATE users SET role = 'operator' WHERE username = 'andres'`);
    const operator = await post({ cookie: `${SESSION_COOKIE}=${session}` }, codeAt(t0));
    assert.equal(operator.status, 403);
    assert.equal((await operator.text()).includes(TOKEN), false);
  });

  it("rejects a cross-origin POST", async () => {
    const response = await post(
      {
        cookie: `${SESSION_COOKIE}=${session}`,
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
      },
      codeAt(t0),
    );
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.text()).includes(TOKEN), false);
  });

  it("returns 503 when the ingest token is unset", async () => {
    delete process.env.FITNESS_INGEST_TOKEN;
    const missing = await post({ cookie: `${SESSION_COOKIE}=${session}` }, codeAt(t0));
    assert.equal(missing.status, 503);
    assert.equal(missing.headers.get("cache-control"), "no-store");
    const missingBody = (await missing.json()) as { ok: boolean; error?: string; token?: string };
    assert.equal(missingBody.ok, false);
    assert.equal(missingBody.error, "not configured");
    assert.equal(missingBody.token, undefined);

    process.env.FITNESS_INGEST_TOKEN = "   ";
    const blank = await post({ cookie: `${SESSION_COOKIE}=${session}` }, codeAt(t0));
    assert.equal(blank.status, 503);
    const blankBody = (await blank.json()) as { error?: string; token?: string };
    assert.equal(blankBody.error, "not configured");
    assert.equal(blankBody.token, undefined);
  });

  it("keeps the token out of the security page HTML", () => {
    const env = { ...process.env, FITNESS_INGEST_TOKEN: TOKEN };
    const rendered = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/lib/fitness-token-html.ts"],
      { cwd: new URL("../..", import.meta.url).pathname, env, encoding: "utf8" },
    );
    assert.equal(rendered.status, 0, rendered.stderr);
    const body = JSON.parse(rendered.stdout) as { html: string; bare: string };
    assert.equal(body.html.includes(TOKEN), false);
    assert.match(body.html, /Fitness sync token/);
    assert.match(body.html, /••••/);
    assert.match(body.html, /Reveal/);
    assert.match(body.html, /Copy/);
    assert.match(body.html, /Authenticator code/);
    assert.match(body.html, /Set up the iPhone Shortcut/);
    assert.match(body.html, /Resonance Nightly/);
    assert.match(body.html, /Resonance Backfill/);
    assert.match(body.html, /Automation/);
    assert.match(body.html, /paste the token you copied above/);
    assert.match(body.html, /https:\/\/resonance3\.vercel\.app\/api\/fitness\/ingest/);
    assert.match(body.html, /larger total/);
    assert.doesNotMatch(body.html, /<FITNESS_TOKEN>/);
    assert.equal(body.html.includes('data-revealed="yes"'), false);
    assert.match(body.bare, /not configured/);
    assert.equal(body.bare.includes(TOKEN), false);
    assert.equal(body.bare.includes("••••"), false);

    const page = readFileSync(new URL("../app/settings/security/page.tsx", import.meta.url), "utf8");
    const row = readFileSync(new URL("../components/fitness-token-row.tsx", import.meta.url), "utf8");
    assert.match(page, /Boolean\(process\.env\.FITNESS_INGEST_TOKEN\?\.trim\(\)\)/);
    assert.equal(page.includes(TOKEN), false);
    assert.equal(row.includes("FITNESS_INGEST_TOKEN"), false);
    assert.equal(row.includes("process.env"), false);
  });
});
