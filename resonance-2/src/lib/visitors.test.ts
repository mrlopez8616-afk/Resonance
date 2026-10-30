import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { newDb } from "pg-mem";
import { POST } from "@/app/api/visitors/route";
import { isLoggedOutVisitorHit, isVisitorCountPost, planAccess } from "@/lib/auth-core";
import { setSqlClientForTests, type SqlClient } from "@/lib/pg/client";
import { migrate } from "@/lib/pg/migrate";
import { proxy } from "@/proxy";
import { readVisitorSummary } from "@/lib/visitors-store";
import {
  allowVisitorHit,
  isBot,
  resetVisitorHitsForTests,
  trackingDeclined,
  utcDay,
  visitorHash,
} from "@/lib/visitors";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "../..");

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

describe("anonymous visitors", () => {
  const previous = process.env.AUTH_SESSION_SECRET;

  after(() => {
    setSqlClientForTests(null);
    resetVisitorHitsForTests();
    if (previous === undefined) delete process.env.AUTH_SESSION_SECRET;
    else process.env.AUTH_SESSION_SECRET = previous;
  });

  it("does not redirect a logged-out login-page POST /api/visitors", async () => {
    process.env.AUTH_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$dummy";
    process.env.AUTH_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
    process.env.AUTH_SESSION_SECRET = "visitor-salt-for-tests";
    assert.equal(isVisitorCountPost("/api/visitors", "POST"), true);
    assert.equal(isVisitorCountPost("/api/visitors", "GET"), false);
    assert.equal(
      isLoggedOutVisitorHit({
        bodyPath: "/login",
        referer: "https://resonance3.vercel.app/login?next=%2F",
        origin: "https://resonance3.vercel.app",
      }),
      true,
    );
    assert.equal(
      isLoggedOutVisitorHit({
        bodyPath: "/",
        referer: "https://resonance3.vercel.app/",
        origin: "https://resonance3.vercel.app",
      }),
      true,
    );
    assert.equal(
      isLoggedOutVisitorHit({
        bodyPath: "/n/crypto",
        referer: "https://resonance3.vercel.app/login",
        origin: "https://resonance3.vercel.app",
      }),
      false,
    );
    assert.equal(
      planAccess({
        pathname: "/api/visitors",
        method: "POST",
        sessionToken: null,
        bearerOk: false,
        loginConfigured: true,
        nextPath: "/api/visitors",
        loginVisitorHit: true,
      }).kind,
      "allow",
    );
    assert.equal(
      planAccess({
        pathname: "/api/visitors",
        method: "POST",
        sessionToken: null,
        bearerOk: false,
        loginConfigured: true,
        nextPath: "/api/visitors",
      }).kind,
      "deny",
    );
    const posted = await proxy(
      new NextRequest("https://resonance3.vercel.app/api/visitors", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0 Chrome/120.0.0.0",
          referer: "https://resonance3.vercel.app/login",
        },
        body: JSON.stringify({ path: "/login" }),
      }),
    );
    assert.notEqual(posted.status, 307);
    assert.notEqual(posted.status, 302);
    assert.equal(posted.headers.get("location"), null);
    assert.equal(posted.headers.get("x-middleware-next"), "1");
    const landing = await proxy(
      new NextRequest("https://resonance3.vercel.app/api/visitors", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0 Chrome/120.0.0.0",
          referer: "https://resonance3.vercel.app/",
        },
        body: JSON.stringify({ path: "/" }),
      }),
    );
    assert.equal(landing.headers.get("location"), null);
    assert.equal(landing.headers.get("x-middleware-next"), "1");
    const floor = await proxy(
      new NextRequest("https://resonance3.vercel.app/api/visitors", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0 Chrome/120.0.0.0",
          referer: "https://resonance3.vercel.app/login",
        },
        body: JSON.stringify({ path: "/n/crypto" }),
      }),
    );
    assert.equal(floor.status, 401);
    assert.equal(floor.headers.get("location"), null);
    const read = await proxy(new NextRequest("https://resonance3.vercel.app/api/visitors"));
    assert.equal(read.status, 401);
    assert.equal(read.headers.get("location"), null);
    const home = await proxy(new NextRequest("https://resonance3.vercel.app/"));
    assert.equal(home.status, 307);
    assert.match(home.headers.get("location") ?? "", /\/login/);
    const layout = readFileSync(join(root, "src/app/layout.tsx"), "utf8");
    const beacon = layout.slice(layout.indexOf("<body"));
    assert.match(beacon, /<VisitorBeacon \/>/);
    assert.equal(beacon.includes("publicMode"), false);
  });

  it("hashes a daily salt and never returns the address", () => {
    const ip = "203.0.113.10";
    const ua = "Mozilla/5.0 Chrome/120.0.0.0";
    const first = visitorHash(ip, ua, "2026-10-29", "salt-a");
    const same = visitorHash(ip, ua, "2026-10-29", "salt-a");
    const nextDay = visitorHash(ip, ua, "2026-10-30", "salt-a");
    assert.equal(first, same);
    assert.notEqual(first, nextDay);
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.equal(first.includes(ip), false);
    assert.equal(first.includes("Chrome"), false);
    assert.equal(isBot("curl/8.0"), true);
    assert.equal(isBot("Mozilla/5.0 Chrome/120.0.0.0"), false);
    assert.equal(trackingDeclined(new Headers({ dnt: "1" })), true);
    assert.equal(trackingDeclined(new Headers({ "sec-gpc": "1" })), true);
    assert.equal(trackingDeclined(new Headers()), false);
    resetVisitorHitsForTests();
    assert.equal(allowVisitorHit("abc", 1_000), true);
    assert.equal(allowVisitorHit("abc", 1_500), false);
    assert.equal(allowVisitorHit("abc", 4_000), true);
  });

  it("increments only the visitor tables and returns an empty body", async () => {
    process.env.AUTH_SESSION_SECRET = "visitor-salt-for-tests";
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    setSqlClientForTests(memorySql());
    await migrate();
    resetVisitorHitsForTests();
    const store = readFileSync(join(root, "src/lib/visitors-store.ts"), "utf8");
    assert.equal(store.includes("INSERT INTO visitor_"), true);
    assert.equal(/INSERT INTO (?!visitor_)/.test(store), false);
    assert.match(store, /visitor_days\.page_views/);
    assert.equal(store.includes("fills"), false);
    assert.equal(store.includes("finance_snapshots"), false);

    const headers = {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 Chrome/120.0.0.0",
      "x-forwarded-for": "203.0.113.10",
    };
    const hit = () =>
      POST(
        new Request("https://resonance3.vercel.app/api/visitors", {
          method: "POST",
          headers,
          body: JSON.stringify({ path: "/login?next=/" }),
        }),
      );
    const first = await hit();
    assert.equal(first.status, 204);
    assert.equal(await first.text(), "");
    const repeat = await hit();
    assert.equal(repeat.status, 204);
    const declined = await POST(
      new Request("https://resonance3.vercel.app/api/visitors", {
        method: "POST",
        headers: { ...headers, dnt: "1" },
        body: JSON.stringify({ path: "/n/build" }),
      }),
    );
    assert.equal(declined.status, 204);
    const bot = await POST(
      new Request("https://resonance3.vercel.app/api/visitors", {
        method: "POST",
        headers: { ...headers, "user-agent": "curl/8.0" },
        body: JSON.stringify({ path: "/n/build" }),
      }),
    );
    assert.equal(bot.status, 204);
    const floor = await POST(
      new Request("https://resonance3.vercel.app/api/visitors", {
        method: "POST",
        headers: { ...headers, "x-forwarded-for": "203.0.113.11" },
        body: JSON.stringify({ path: "/n/crypto" }),
      }),
    );
    assert.equal(floor.status, 204);

    const now = new Date();
    const summary = await readVisitorSummary(now);
    const today = summary.days.find((day) => day.day === utcDay(now));
    assert.equal(summary.totalViews, 1);
    assert.equal(summary.totalVisitors, 1);
    assert.equal(today?.views, 1);
    assert.equal(JSON.stringify(summary).includes("203.0.113.10"), false);
    assert.equal(JSON.stringify(summary).includes("Chrome"), false);
    assert.equal(JSON.stringify(summary).includes("$"), false);
  });
});
