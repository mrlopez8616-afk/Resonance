import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logoutAll } from "@/app/api/auth/logout-all/route";
import { POST as passkeyVerify } from "@/app/api/auth/passkey/login/verify/route";
import { setSqlClientForTests, type SqlClient } from "@/lib/pg/client";
import { migrate } from "@/lib/pg/migrate";
import { publicFitnessDetail } from "@/lib/fitness-board";
import { NextRequest } from "next/server";
import { drillDownBroken } from "@/lib/health-report";
import { proxy } from "@/proxy";
import { isHiddenInPublicMode } from "@/lib/public-mode";
import {
  ROUTE_AUDIT,
  htmlHasErrorBoundary,
  loggedOutPageIssues,
  payloadLeaksPrivate,
  runPublicViewProbe,
} from "@/lib/public-view-probe";
import { createSession } from "@/lib/auth-store";
import { SESSION_COOKIE } from "@/lib/auth-core";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "../..");

const SECRET_NAMES = [
  "AUTH_PASSWORD_HASH",
  "AUTH_TOTP_SECRET",
  "AUTH_SESSION_SECRET",
  "RESONANCE_SYNC_SECRET",
  "RESONANCE_HEALTH_TOKEN",
  "FITNESS_INGEST_TOKEN",
  "FINANCE_INGEST_TOKEN",
  "FINANCE_ENC_KEY",
  "CRON_SECRET",
  "DATABASE_URL",
  "BLOB_READ_WRITE_TOKEN",
  "GOOGLE_YT_CLIENT_ID",
  "GOOGLE_YT_CLIENT_SECRET",
];

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

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

describe("logged-out privacy", () => {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_PASSWORD_HASH: process.env.AUTH_PASSWORD_HASH,
    AUTH_TOTP_SECRET: process.env.AUTH_TOTP_SECRET,
    AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
    RESONANCE_SYNC_SECRET: process.env.RESONANCE_SYNC_SECRET,
    RESONANCE_HEALTH_TOKEN: process.env.RESONANCE_HEALTH_TOKEN,
    FITNESS_INGEST_TOKEN: process.env.FITNESS_INGEST_TOKEN,
    WEBAUTHN_RP_ID: process.env.WEBAUTHN_RP_ID,
    WEBAUTHN_ORIGIN: process.env.WEBAUTHN_ORIGIN,
  };

  after(() => {
    setSqlClientForTests(null);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("covers every API route and keeps secrets out of client files", () => {
    const routes = walk(join(root, "src/app/api")).filter((path) => path.endsWith("route.ts"));
    assert.ok(routes.length > 40);
    for (const file of routes) {
      const normalized = file.replace(/\\/g, "/");
      const url = normalized.slice(normalized.indexOf("/src/app") + "/src/app".length).replace(/\/route\.ts$/, "");
      const listed = ROUTE_AUDIT.some((row) => url === row.path);
      assert.equal(listed, true, url);
    }
    const clients = walk(join(root, "src")).filter((path) => path.endsWith(".ts") || path.endsWith(".tsx"));
    for (const file of clients) {
      const source = readFileSync(file, "utf8");
      if (!source.startsWith('"use client"') && !source.startsWith("'use client'")) continue;
      assert.equal(source.includes("NEXT_PUBLIC_"), false, file);
      for (const name of SECRET_NAMES) {
        assert.equal(source.includes(name), false, `${file} ${name}`);
      }
    }
  });

  it("keeps fitness steps, runs, and analytics open in public view", () => {
    for (const path of ["/n/fitness/steps", "/n/fitness/runs", "/n/fitness/analytics"]) {
      assert.equal(isHiddenInPublicMode(path), false, path);
      assert.equal(drillDownBroken(path, "public"), false, path);
      assert.equal(drillDownBroken(path, "private"), false, path);
    }
    const steps = publicFitnessDetail({
      id: "steps",
      title: "Steps",
      headline: "8420",
      detail: "today",
      rows: [{ id: "today", primary: "8420", secondary: "steps" }],
      weeks: [],
      months: [],
      pace: [],
    });
    const runs = publicFitnessDetail({
      id: "runs",
      title: "Runs",
      headline: "3.2 mi",
      detail: "this week",
      rows: [{ id: "week", primary: "3.2 mi", secondary: "2 runs" }],
      weeks: [],
      months: [],
      pace: [],
    });
    for (const detail of [steps, runs]) {
      const text = JSON.stringify(detail);
      assert.equal(payloadLeaksPrivate(text), false, detail.id);
      assert.equal(htmlHasErrorBoundary(text), false, detail.id);
    }
    const ingest = ROUTE_AUDIT.find((row) => row.path === "/api/ingest/health-auto-export");
    assert.equal(ingest?.method, "POST");
    assert.match(ingest?.auth ?? "", /token/i);
  });

  it("treats a logged-out home redirect as the login gate", async () => {
    const home = await proxy(new NextRequest("https://resonance3.vercel.app/"));
    assert.equal(home.status, 307);
    const location = new URL(home.headers.get("location") ?? "", "https://resonance3.vercel.app");
    assert.equal(location.pathname, "/login");
    assert.equal(location.searchParams.get("next"), "/");
    const text = await home.text();
    assert.equal(htmlHasErrorBoundary(text), false);
    assert.equal(payloadLeaksPrivate(text), false);
    assert.deepEqual(loggedOutPageIssues("/", home.status, text), []);
    assert.equal(loggedOutPageIssues("/", 500, "").some((row) => row.id === "public-page-status"), true);
    const boundary = loggedOutPageIssues("/", 200, "Application error");
    assert.equal(boundary[0]?.id, "public-page-error");
    assert.equal(boundary[0]?.status, "error");
    assert.equal(boundary[0]?.path, "/");

    const probe = readFileSync(join(root, "src/lib/public-view-probe.ts"), "utf8");
    assert.equal(probe.includes("readFileSync"), false);
    assert.equal(probe.includes("node-face.tsx"), false);
    const face = readFileSync(join(root, "src/components/node-face.tsx"), "utf8");
    assert.equal(face.includes("data-lock-badge"), true);
    assert.match(face, /face\.href && !locked/);
  });

  it("names a failure when a logged-out body carries a dollar amount", () => {
    assert.equal(payloadLeaksPrivate('{"ok":false,"error":"Unauthorized."}'), false);
    assert.equal(payloadLeaksPrivate('{"balance":"$12.00"}'), true);
    assert.equal(payloadLeaksPrivate('{"heartRateAvg":154}'), true);
    assert.equal(payloadLeaksPrivate("154 bpm"), true);
    assert.equal(payloadLeaksPrivate("no data yet"), false);
  });

  it("rejects logged-out reads and writes, and locks Finance", async () => {
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    process.env.AUTH_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$dummy";
    process.env.AUTH_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
    process.env.AUTH_SESSION_SECRET = "session-secret-for-privacy-tests";
    process.env.RESONANCE_SYNC_SECRET = "hub-secret";
    process.env.RESONANCE_HEALTH_TOKEN = "health-token";
    process.env.FITNESS_INGEST_TOKEN = "phone-token";
    process.env.WEBAUTHN_RP_ID = "localhost";
    process.env.WEBAUTHN_ORIGIN = "http://localhost:3001";
    setSqlClientForTests(memorySql());
    await migrate();

    const anonymous = await logoutAll(new Request("https://resonance3.vercel.app/api/auth/logout-all", { method: "POST" }));
    assert.equal(anonymous.status, 401);
    const token = await createSession("Mozilla/5.0 Chrome/120.0.0.0");
    assert.equal((await logoutAll(new Request("https://resonance3.vercel.app/api/auth/logout-all"))).status, 401);
    const authed = await logoutAll(
      new Request("https://resonance3.vercel.app/api/auth/logout-all", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      }),
    );
    assert.equal(authed.status, 303);

    const denied = await login(
      new Request("https://resonance3.vercel.app/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    assert.equal(denied.status, 401);
    assert.equal(payloadLeaksPrivate(await denied.text()), false);

    const passkey = await passkeyVerify(
      new Request("https://resonance3.vercel.app/api/auth/passkey/login/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    assert.equal(passkey.status, 401);
    assert.equal(payloadLeaksPrivate(await passkey.text()), false);

    const loggedOutSteps = await proxy(new NextRequest("https://resonance3.vercel.app/n/fitness/steps"));
    assert.notEqual(loggedOutSteps.status, 200);
    assert.equal(loggedOutSteps.status === 307 || loggedOutSteps.status === 302, true);
    assert.equal(payloadLeaksPrivate(await loggedOutSteps.text()), false);
    const loggedOutRuns = await proxy(new NextRequest("https://resonance3.vercel.app/n/fitness/runs"));
    assert.notEqual(loggedOutRuns.status, 200);
    const loggedOutAnalytics = await proxy(new NextRequest("https://resonance3.vercel.app/n/fitness/analytics"));
    assert.notEqual(loggedOutAnalytics.status, 200);

    const issues = await runPublicViewProbe();
    const errors = issues.filter((row) => row.status === "error");
    assert.deepEqual(
      errors.map((row) => `${row.id} ${row.path} ${row.name}`),
      [],
    );
    for (const id of [
      "logged-out-dollar-fields",
      "logged-out-write-open",
      "public-page-status",
      "public-page-error",
      "public-drill-down",
      "finance-lock-tile",
      "finance-lock-href",
      "finance-logged-out-page",
      "finance-logged-out-api",
    ]) {
      assert.equal(issues.some((row) => row.id === id && row.status === "ok"), true, id);
    }
    assert.equal(JSON.stringify(issues).includes("$"), false);
  });
});
