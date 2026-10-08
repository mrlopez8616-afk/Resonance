import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { hash } from "@node-rs/argon2";
import { Secret, TOTP } from "otpauth";
import { NextRequest } from "next/server";
import { newDb } from "pg-mem";
import { GET as getBreakdown, POST as postBreakdown } from "@/app/api/fights/breakdown/route";
import { GET as getBets } from "@/app/api/bets/route";
import { POST as postBets } from "@/app/api/bets/route";
import { GET as getCalendar } from "@/app/api/calendar/route";
import { GET as getFills } from "@/app/api/fills/route";
import { POST as postIngest } from "@/app/api/fitness/ingest/route";
import { GET as getMood } from "@/app/api/portfolio-mood/route";
import { GET as getSleeves } from "@/app/api/sleeves/route";
import { GET as getSpot } from "@/app/api/spot-price/route";
import { GET as getXrp } from "@/app/api/xrp-price/route";
import { sampleMetricsBody } from "@/lib/fitness-sample";
import { SESSION_COOKIE } from "@/lib/auth-core";
import { createSession, deleteSession } from "@/lib/auth-store";
import { setSqlClientForTests, type SqlClient } from "@/lib/pg/client";
import { migrate } from "@/lib/pg/migrate";
import { proxy } from "@/proxy";

const TOTP_SECRET = "JBSWY3DPEHPK3PXP";
const PASSWORD = "floor-secret";
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
    WEBAUTHN_RP_ID: process.env.WEBAUTHN_RP_ID,
    WEBAUTHN_ORIGIN: process.env.WEBAUTHN_ORIGIN,
  };
}

function restore(previous: ReturnType<typeof envSnapshot>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function request(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

describe("read and machine access", { concurrency: false }, () => {
  const previous = envSnapshot();
  let token = "";
  let passwordHash = "";

  before(async () => {
    passwordHash = await hash(PASSWORD);
  });

  after(() => {
    restore(previous);
    setSqlClientForTests(null);
  });

  beforeEach(async () => {
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    process.env.AUTH_PASSWORD_HASH = passwordHash;
    process.env.AUTH_TOTP_SECRET = TOTP_SECRET;
    process.env.AUTH_SESSION_SECRET = "session-secret-for-tests";
    process.env.RESONANCE_SYNC_SECRET = "hub-secret";
    process.env.FITNESS_INGEST_TOKEN = "phone-token";
    process.env.WEBAUTHN_RP_ID = "localhost";
    process.env.WEBAUTHN_ORIGIN = "http://localhost:3001";
    setSqlClientForTests(memorySql());
    await migrate();
    token = await createSession("Mozilla/5.0 Chrome/120.0.0.0", t0);
  });

  it("returns 401 for anonymous reads and 200 for a session or the bearer", async () => {
    const reads: { url: string; get: (request: Request) => Promise<Response>; status: number }[] = [
      { url: "https://resonance3.vercel.app/api/bets", get: getBets, status: 200 },
      { url: "https://resonance3.vercel.app/api/calendar", get: getCalendar, status: 200 },
      { url: "https://resonance3.vercel.app/api/fills", get: getFills, status: 200 },
      { url: "https://resonance3.vercel.app/api/sleeves?ticker=XRP", get: getSleeves, status: 200 },
      { url: "https://resonance3.vercel.app/api/portfolio-mood", get: getMood, status: 200 },
      {
        url: "https://resonance3.vercel.app/api/fights/breakdown?event=ufc-332",
        get: getBreakdown,
        status: 200,
      },
    ];
    for (const route of reads) {
      const anonymous = await route.get(request(route.url));
      assert.equal(anonymous.status, 401, route.url);
      const session = await route.get(
        request(route.url, { cookie: `${SESSION_COOKIE}=${token}` }),
      );
      assert.equal(session.status, route.status, route.url);
      const bearer = await route.get(
        request(route.url, { authorization: "Bearer hub-secret" }),
      );
      assert.equal(bearer.status, route.status, `${route.url} bearer`);
    }

    const spotUrl = "https://resonance3.vercel.app/api/spot-price?ticker=XRP";
    const xrpUrl = "https://resonance3.vercel.app/api/xrp-price";
    assert.equal((await getSpot(request(spotUrl))).status, 401);
    assert.equal((await getXrp(request(xrpUrl))).status, 401);
    const spot = await getSpot(request(spotUrl, { cookie: `${SESSION_COOKIE}=${token}` }));
    const xrp = await getXrp(request(xrpUrl, { authorization: "Bearer hub-secret" }));
    assert.notEqual(spot.status, 401);
    assert.notEqual(xrp.status, 401);
    assert.equal(codeAt(t0).length, 6);
  });

  it("keeps bearer writes and fitness ingest open without a session", async () => {
    const write = await postBets(
      new Request("https://resonance3.vercel.app/api/bets", {
        method: "POST",
        headers: {
          authorization: "Bearer hub-secret",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );
    assert.notEqual(write.status, 401);
    assert.equal(write.status, 400);

    const ingest = await postIngest(
      new Request("https://resonance3.vercel.app/api/fitness/ingest", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-fitness-token": "phone-token",
        },
        body: JSON.stringify(sampleMetricsBody),
      }),
    );
    assert.equal(ingest.status, 200);

    const breakdownWrite = await postBreakdown(
      new Request("https://resonance3.vercel.app/api/fights/breakdown", {
        method: "POST",
        headers: {
          authorization: "Bearer hub-secret",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );
    assert.notEqual(breakdownWrite.status, 401);
    const breakdownBlocked = await postBreakdown(
      new Request("https://resonance3.vercel.app/api/fights/breakdown", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    assert.equal(breakdownBlocked.status, 401);

    const blocked = await postBets(
      new Request("https://resonance3.vercel.app/api/bets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    assert.equal(blocked.status, 401);
  });

  it("fails closed for reads when login env is missing, except the bearer", async () => {
    delete process.env.AUTH_TOTP_SECRET;
    const anonymous = await getBets(request("https://resonance3.vercel.app/api/bets"));
    assert.equal(anonymous.status, 401);
    const cookie = await getBets(
      request("https://resonance3.vercel.app/api/bets", { cookie: `${SESSION_COOKIE}=${token}` }),
    );
    assert.equal(cookie.status, 401);
    const bearer = await getBets(
      request("https://resonance3.vercel.app/api/bets", { authorization: "Bearer hub-secret" }),
    );
    assert.equal(bearer.status, 200);

    const ingest = await postIngest(
      new Request("https://resonance3.vercel.app/api/fitness/ingest", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-fitness-token": "phone-token",
        },
        body: JSON.stringify(sampleMetricsBody),
      }),
    );
    assert.equal(ingest.status, 200);
  });

  it("enforces the proxy allowlist, including the breakdown read", async () => {
    const home = await proxy(new NextRequest("https://resonance3.vercel.app/"));
    assert.equal(home.status, 307);
    assert.equal(new URL(home.headers.get("location") ?? "").searchParams.get("next"), "/");

    const fights = await proxy(new NextRequest("https://resonance3.vercel.app/fights"));
    assert.equal(new URL(fights.headers.get("location") ?? "").pathname, "/login");
    assert.equal(new URL(fights.headers.get("location") ?? "").searchParams.get("next"), "/fights");

    const predictions = await proxy(new NextRequest("https://resonance3.vercel.app/n/predictions"));
    assert.equal(
      new URL(predictions.headers.get("location") ?? "").searchParams.get("next"),
      "/n/predictions",
    );

    const login = await proxy(new NextRequest("https://resonance3.vercel.app/login"));
    assert.equal(login.headers.get("location"), null);
    assert.equal(login.headers.get("x-middleware-next"), "1");

    const anon = await proxy(new NextRequest("https://resonance3.vercel.app/api/bets"));
    assert.equal(anon.status, 401);

    const pending = await proxy(
      new NextRequest("https://resonance3.vercel.app/api/fights/breakdown?event=ufc-332"),
    );
    assert.equal(pending.status, 401);

    const bearer = await proxy(
      new NextRequest("https://resonance3.vercel.app/api/fights/breakdown?event=ufc-332", {
        headers: { authorization: "Bearer hub-secret" },
      }),
    );
    assert.equal(bearer.status, 200);

    const machine = await proxy(
      new NextRequest("https://resonance3.vercel.app/api/bets", {
        method: "POST",
        headers: { authorization: "Bearer hub-secret" },
      }),
    );
    assert.equal(machine.status, 200);

    const fitness = await proxy(
      new NextRequest("https://resonance3.vercel.app/api/fitness/ingest", {
        method: "POST",
        headers: { "x-fitness-token": "phone-token" },
      }),
    );
    assert.equal(fitness.status, 200);

    const authed = await proxy(
      new NextRequest("https://resonance3.vercel.app/api/fights/breakdown", {
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      }),
    );
    assert.equal(authed.status, 200);

    await deleteSession(token);
    const revoked = await proxy(
      new NextRequest("https://resonance3.vercel.app/api/fights/breakdown", {
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      }),
    );
    assert.equal(revoked.status, 401);

    delete process.env.AUTH_PASSWORD_HASH;
    const locked = await proxy(
      new NextRequest("https://resonance3.vercel.app/", {
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      }),
    );
    assert.equal(locked.status, 307);
    const lockedApi = await proxy(new NextRequest("https://resonance3.vercel.app/api/calendar"));
    assert.equal(lockedApi.status, 401);
    const lockedBearer = await proxy(
      new NextRequest("https://resonance3.vercel.app/api/calendar", {
        headers: { authorization: "Bearer hub-secret" },
      }),
    );
    assert.equal(lockedBearer.status, 200);
  });
});
