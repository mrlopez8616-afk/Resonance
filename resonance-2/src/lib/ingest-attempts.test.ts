import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";
import { POST as postFitness } from "@/app/api/fitness/ingest/route";
import { GET as getHealth } from "@/app/api/health/full/route";
import { POST as postHealthAutoExport } from "@/app/api/ingest/health-auto-export/route";
import {
  HEALTH_AUTO_EXPORT_BODY_LIMIT,
  HEALTH_AUTO_EXPORT_HEADER,
  hashHealthAutoExportToken,
} from "@/lib/health-auto-export";
import { saveHealthAutoExportTokenHash } from "@/lib/health-auto-export-store";
import { setHealthFullLoaderForTests } from "@/lib/health-full-load";
import type { HealthFullReport } from "@/lib/health-report";
import { resetFitnessStoreForTests } from "@/lib/fitness-store";
import {
  FITNESS_INGEST_ROUTE,
  HEALTH_AUTO_EXPORT_INGEST_ROUTE,
  rejectedAuthHeaderNames,
  type IngestHealth,
  type IngestRejectRow,
} from "@/lib/ingest-attempts";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS, INGEST_ATTEMPT_HEADERS_SQL, INGEST_ATTEMPTS_SQL } from "@/lib/pg/embedded-migrations";
import { migrate } from "@/lib/pg/migrate";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HAE = "https://resonance3.vercel.app/api/ingest/health-auto-export";
const FITNESS = "https://resonance3.vercel.app/api/fitness/ingest";
const HEALTH = "https://resonance3.vercel.app/api/health/full";
const TOKEN = "plain-secret-token";
const MARKER = "BODY-MARKER-9f3a";
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const ROUTE_KEYS = [
  "attempts24h",
  "lastAttemptAt",
  "lastRejectAt",
  "lastRejectReason",
  "lastRejectStatus",
  "lastSuccessAt",
  "recentRejects",
  "rejects24h",
] as const;

const STORED_NAME = /^(?:[a-z0-9-]{1,40}|query:(?:token|key|api_key|auth|access_token)|host:other)$/;

function storedNames(value: string | null): string[] {
  assert.equal(typeof value, "string");
  const parsed = JSON.parse(value ?? "") as unknown;
  assert.ok(Array.isArray(parsed));
  const names = parsed.filter((item): item is string => typeof item === "string");
  assert.equal(names.length, parsed.length);
  for (const name of names) assert.match(name, STORED_NAME);
  return names;
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

type AttemptRow = {
  route: string;
  status_code: number | string;
  auth_ok: boolean | string;
  reason: string;
  user_agent: string | null;
  content_length: number | string | null;
  rows_upserted: number | string | null;
};

function num(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function flag(value: boolean | string): boolean {
  return value === true || value === "t" || value === "true";
}

async function attempts(): Promise<AttemptRow[]> {
  return sqlQuery<AttemptRow>(
    `SELECT route, status_code, auth_ok, reason, user_agent, content_length, rows_upserted
     FROM ingest_attempts ORDER BY id`,
  );
}

function postHae(body: unknown, token: string | null, extra: Record<string, string> = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(payload)),
    ...extra,
  };
  if (token) headers[HEALTH_AUTO_EXPORT_HEADER] = token;
  return postHealthAutoExport(new Request(HAE, { method: "POST", headers, body: payload }));
}

function postFit(body: unknown, headers: Record<string, string> = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return postFitness(
    new Request(FITNESS, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(payload)),
        ...headers,
      },
      body: payload,
    }),
  );
}

function healthRequest(token: string | null) {
  const headers = token ? { authorization: `Bearer ${token}` } : undefined;
  return getHealth(new Request(HEALTH, { headers }));
}

const steps = {
  data: {
    metrics: [
      {
        name: "step_count",
        units: "count",
        data: [{ qty: 10, date: "2026-09-01 00:00:00 -0500", source: MARKER }],
      },
    ],
  },
};

describe("ingest attempts", { concurrency: false }, () => {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    RESONANCE_HEALTH_TOKEN: process.env.RESONANCE_HEALTH_TOKEN,
    RESONANCE_SYNC_SECRET: process.env.RESONANCE_SYNC_SECRET,
    FITNESS_INGEST_TOKEN: process.env.FITNESS_INGEST_TOKEN,
  };

  after(() => {
    setSqlClientForTests(null);
    setHealthFullLoaderForTests(null);
    resetFitnessStoreForTests();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  beforeEach(async () => {
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    process.env.RESONANCE_HEALTH_TOKEN = "health-token";
    process.env.RESONANCE_SYNC_SECRET = "hub-secret";
    process.env.FITNESS_INGEST_TOKEN = "phone-token";
    resetFitnessStoreForTests();
    setHealthFullLoaderForTests(async () => ({ checkedAt: "2026-11-13T12:00:00.000Z" }) as HealthFullReport);
    setSqlClientForTests(memorySql());
    await migrate();
  });

  it("keeps the migration file and the embedded copy identical", () => {
    const file = readFileSync(path.join(root, "db/migrations/050_ingest_attempts.sql"), "utf8");
    assert.equal(INGEST_ATTEMPTS_SQL, file);
    assert.equal(EMBEDDED_MIGRATIONS.at(-1)?.id, "051_ingest_attempt_headers");
    const headersFile = readFileSync(path.join(root, "db/migrations/051_ingest_attempt_headers.sql"), "utf8");
    assert.equal(INGEST_ATTEMPT_HEADERS_SQL, headersFile);
    assert.equal(headersFile.includes("INSERT"), false);
    assert.equal(file.includes("INSERT"), false);
    assert.equal(file.includes("token_hash"), false);
    assert.equal(file.includes("health_auto_export_tokens"), false);
    const tokenFile = readFileSync(path.join(root, "db/migrations/043_health_auto_export_token.sql"), "utf8");
    assert.match(tokenFile, /updated_at timestamptz NOT NULL/);
    const source = readFileSync(path.join(root, "src/lib/ingest-attempts.ts"), "utf8");
    assert.equal(source.includes("token_hash"), false);
    assert.equal(source.includes(HEALTH_AUTO_EXPORT_HEADER), false);
    assert.equal(source.includes("authorization"), false);
  });

  it("records health auto export rejects and a success without the token or the body", async () => {
    delete process.env.FITNESS_INGEST_TOKEN;
    const closed = await postHae(steps, null);
    assert.equal(closed.status, 503);
    assert.deepEqual(await closed.json(), { ok: false, error: "Health Auto Export is not configured." });
    process.env.FITNESS_INGEST_TOKEN = "phone-token";

    const digest = hashHealthAutoExportToken(TOKEN);
    await saveHealthAutoExportTokenHash(digest);
    const missing = await postHae(steps, null);
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), { ok: false, error: "Unauthorized." });

    const wrong = await postHae(steps, "not-the-token");
    assert.equal(wrong.status, 401);
    const hub = await postHae(steps, "hub-secret");
    assert.equal(hub.status, 401);

    const broken = await postHae("not-json", TOKEN);
    assert.equal(broken.status, 400);
    assert.deepEqual(await broken.json(), { ok: false, error: "JSON body is required." });

    const empty = await postHae({ data: { metrics: [], workouts: [] } }, TOKEN);
    assert.equal(empty.status, 400);
    assert.deepEqual(await empty.json(), { ok: false, error: "No steps or workouts in the body." });

    const agent = "U".repeat(250);
    const saved = await postHae(steps, TOKEN, { "user-agent": agent });
    assert.equal(saved.status, 200);
    assert.deepEqual(await saved.json(), { ok: true, steps: 1, workouts: 0 });

    const huge = await postHae("{}", TOKEN, { "content-length": String(HEALTH_AUTO_EXPORT_BODY_LIMIT + 1) });
    assert.equal(huge.status, 413);

    const rows = await attempts();
    assert.deepEqual(
      rows.map((row) => [row.reason, num(row.status_code), flag(row.auth_ok), num(row.rows_upserted)]),
      [
        ["no token configured", 503, false, null],
        ["missing header", 401, false, null],
        ["bad token", 401, false, null],
        ["bad token", 401, false, null],
        ["bad body", 400, true, null],
        ["bad body", 400, true, null],
        ["ok", 200, true, 1],
        ["body too large", 413, false, null],
      ],
    );
    assert.equal(rows[6]?.user_agent, "U".repeat(200));
    assert.equal(rows[6]?.user_agent?.length, 200);
    assert.equal(num(rows[6]?.content_length), Buffer.byteLength(JSON.stringify(steps)));
    assert.equal(num(rows[7]?.content_length), HEALTH_AUTO_EXPORT_BODY_LIMIT + 1);
    const dump = JSON.stringify(rows);
    assert.equal(dump.includes(TOKEN), false);
    assert.equal(dump.includes("not-the-token"), false);
    assert.equal(dump.includes(digest), false);
    assert.equal(dump.includes(MARKER), false);
    assert.equal(dump.includes("hub-secret"), false);
    assert.equal(rows.every((row) => row.route === HEALTH_AUTO_EXPORT_INGEST_ROUTE), true);
  });

  it("records fitness rejects separately from a stored day", async () => {
    delete process.env.FITNESS_INGEST_TOKEN;
    const closed = await postFit({ source: "shortcuts", date: "2026-10-12", steps: 10 });
    assert.equal(closed.status, 503);
    assert.deepEqual(await closed.json(), { ok: false, error: "Fitness ingest is not configured." });

    process.env.FITNESS_INGEST_TOKEN = "phone-token";
    const missing = await postFit({ source: "shortcuts", date: "2026-10-12", steps: 10 });
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), {
      ok: false,
      error: "Send Authorization: Bearer <token>, X-Resonance-Token, or X-Fitness-Token.",
    });
    const wrong = await postFit(
      { source: "shortcuts", date: "2026-10-12", steps: 10 },
      { authorization: "Bearer not-the-phone-token" },
    );
    assert.equal(wrong.status, 401);
    const hub = await postFit(
      { source: "shortcuts", date: "2026-10-12", steps: 10 },
      { authorization: "Bearer hub-secret" },
    );
    assert.equal(hub.status, 401);
    const empty = await postFit({}, { authorization: "Bearer phone-token" });
    assert.equal(empty.status, 400);
    assert.deepEqual(await empty.json(), { ok: false, error: "No metrics or workouts in the body." });
    const saved = await postFit(
      { source: "shortcuts", date: "2026-10-12", steps: 100, note: MARKER },
      { authorization: "Bearer phone-token" },
    );
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).ok, true);

    const rows = await attempts();
    assert.deepEqual(
      rows.map((row) => [row.reason, num(row.status_code), flag(row.auth_ok)]),
      [
        ["no token configured", 503, false],
        ["missing header", 401, false],
        ["bad token", 401, false],
        ["bad token", 401, false],
        ["bad body", 400, true],
        ["ok", 200, true],
      ],
    );
    assert.equal(num(rows[5]?.rows_upserted), 1);
    const dump = JSON.stringify(rows);
    assert.equal(dump.includes("phone-token"), false);
    assert.equal(dump.includes("not-the-phone-token"), false);
    assert.equal(dump.includes("hub-secret"), false);
    assert.equal(dump.includes(MARKER), false);
    assert.equal(rows.every((row) => row.route === FITNESS_INGEST_ROUTE), true);
  });

  it("accepts each header form and records only header names when auth fails", async () => {
    const digest = hashHealthAutoExportToken(TOKEN);
    await saveHealthAutoExportTokenHash(digest);
    const marker = "header-value-marker";
    const day = (date: string, qty: number) => ({
      data: {
        metrics: [
          {
            name: "step_count",
            units: "count",
            data: [{ qty, date: `${date} 12:00:00 -0500`, source: marker }],
          },
        ],
      },
    });

    const bearer = await postHae(day("2026-09-04", 11), null, { authorization: `Bearer ${TOKEN}` });
    assert.equal(bearer.status, 200);
    const raw = await postHae(day("2026-09-05", 12), null, { authorization: TOKEN });
    assert.equal(raw.status, 200);
    const prefixed = await postHae(day("2026-09-06", 13), null, {
      [HEALTH_AUTO_EXPORT_HEADER]: `Bearer ${TOKEN}`,
    });
    assert.equal(prefixed.status, 200);
    const fitnessHeader = await postHae(day("2026-09-07", 14), null, {
      "x-fitness-token": "  Bearer phone-token  ",
    });
    assert.equal(fitnessHeader.status, 200);
    const resonanceOnFitness = await postFit(
      { source: "shortcuts", date: "2026-10-14", steps: 40 },
      { "x-resonance-token": "phone-token" },
    );
    assert.equal(resonanceOnFitness.status, 200);
    const doubleBearer = await postFit(
      { source: "shortcuts", date: "2026-10-15", steps: 41 },
      { authorization: "Bearer Bearer phone-token" },
    );
    assert.equal(doubleBearer.status, 200);

    const badBearer = await postHae(day("2026-09-08", 15), null, { authorization: `Bearer ${marker}` });
    assert.equal(badBearer.status, 401);
    const badFitness = await postFit(
      { source: "shortcuts", date: "2026-10-16", steps: 1 },
      { "x-fitness-token": marker, authorization: `Bearer ${marker}-auth` },
    );
    assert.equal(badFitness.status, 401);
    const hub = await postHae(day("2026-09-09", 16), null, { authorization: "Bearer hub-secret" });
    assert.equal(hub.status, 401);
    delete process.env.FITNESS_INGEST_TOKEN;
    await sqlQuery(`DELETE FROM health_auto_export_tokens`);
    const closed = await postHae(day("2026-09-10", 17), TOKEN);
    assert.equal(closed.status, 503);

    const logged = await sqlQuery<{ route: string; reason: string; auth_headers: string | null; auth_ok: boolean | string }>(
      `SELECT route, reason, auth_headers, auth_ok FROM ingest_attempts ORDER BY id`,
    );
    assert.deepEqual(
      logged.slice(0, 6).map((row) => row.auth_headers),
      [null, null, null, null, null, null],
    );
    const failed = logged.slice(6);
    assert.deepEqual(
      failed.map((row) => row.reason),
      ["bad token", "bad token", "bad token", "no token configured"],
    );
    const names = failed.map((row) => storedNames(row.auth_headers));
    assert.equal(names[0]?.includes("authorization"), true);
    assert.equal(names[0]?.includes("content-type"), true);
    assert.equal(names[0]?.includes("host:other"), false);
    assert.equal(names[1]?.includes("authorization"), true);
    assert.equal(names[1]?.includes("x-fitness-token"), true);
    assert.equal(names[2]?.includes("authorization"), true);
    assert.equal(names[3]?.includes("x-resonance-token"), true);
    const dump = JSON.stringify(logged);
    assert.equal(dump.includes(TOKEN), false);
    assert.equal(dump.includes(marker), false);
    assert.equal(dump.includes("phone-token"), false);
    assert.equal(dump.includes("hub-secret"), false);
    assert.equal(dump.includes(digest), false);
    assert.equal(logged.some((row) => String(row.auth_headers ?? "").includes("Bearer")), false);
  });

  it("shows no request, a rejection, and a later success on the private health probe", async () => {
    const denied = await healthRequest(null);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { ok: false, error: "Unauthorized." });
    const sync = await healthRequest("hub-secret");
    assert.equal(sync.status, 401);

    const quiet = await healthRequest("health-token");
    assert.equal(quiet.status, 200);
    const quietBody = (await quiet.json()) as { ingest: IngestHealth };
    const quietHae = quietBody.ingest[HEALTH_AUTO_EXPORT_INGEST_ROUTE];
    const quietFit = quietBody.ingest[FITNESS_INGEST_ROUTE];
    assert.deepEqual(Object.keys(quietBody.ingest).sort(), [FITNESS_INGEST_ROUTE, HEALTH_AUTO_EXPORT_INGEST_ROUTE]);
    assert.deepEqual(Object.keys(quietHae).sort(), [...ROUTE_KEYS, "tokenUpdatedAt"]);
    assert.deepEqual(Object.keys(quietFit).sort(), [...ROUTE_KEYS]);
    assert.equal(quietHae.lastAttemptAt, null);
    assert.equal(quietHae.attempts24h, 0);
    assert.equal(quietHae.rejects24h, 0);
    assert.deepEqual(quietHae.recentRejects, []);
    assert.equal(quietHae.tokenUpdatedAt, null);
    assert.equal(quietFit.lastAttemptAt, null);
    assert.equal(quietFit.lastSuccessAt, null);
    assert.deepEqual(quietFit.recentRejects, []);

    await sqlQuery(
      `INSERT INTO ingest_attempts (route, received_at, status_code, auth_ok, reason)
       VALUES ($1, $2::timestamptz, 401, false, 'bad token'),
              ($1, $3::timestamptz, 400, true, 'bad body')`,
      [
        FITNESS_INGEST_ROUTE,
        new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
      ],
    );
    const saved = await postFit(
      { source: "shortcuts", date: "2026-10-12", steps: 40 },
      { authorization: "Bearer phone-token" },
    );
    assert.equal(saved.status, 200);

    const digest = hashHealthAutoExportToken(TOKEN);
    await saveHealthAutoExportTokenHash(digest);
    const rejected = await postHae({ data: { metrics: [], workouts: [] } }, TOKEN);
    assert.equal(rejected.status, 400);

    const live = await healthRequest("health-token");
    assert.equal(live.status, 200);
    const body = (await live.json()) as { ingest: IngestHealth; secret?: string };
    const hae = body.ingest[HEALTH_AUTO_EXPORT_INGEST_ROUTE];
    const fit = body.ingest[FITNESS_INGEST_ROUTE];
    assert.equal(hae.lastSuccessAt, null);
    assert.equal(hae.lastRejectReason, "bad body");
    assert.equal(hae.lastRejectStatus, 400);
    assert.equal(hae.attempts24h, 1);
    assert.equal(hae.rejects24h, 1);
    assert.match(hae.lastAttemptAt ?? "", ISO);
    assert.equal(hae.lastAttemptAt, hae.lastRejectAt);
    assert.match(hae.tokenUpdatedAt ?? "", ISO);
    assert.equal(fit.lastRejectReason, "bad token");
    assert.equal(fit.lastRejectStatus, 401);
    assert.equal(fit.attempts24h, 1);
    assert.equal(fit.rejects24h, 0);
    assert.match(fit.lastSuccessAt ?? "", ISO);
    assert.equal(fit.lastAttemptAt, fit.lastSuccessAt);
    assert.match(fit.lastRejectAt ?? "", ISO);
    assert.equal(hae.recentRejects.length, 1);
    assert.equal(hae.recentRejects[0]?.reason, "bad body");
    assert.equal(hae.recentRejects[0]?.status_code, 400);
    assert.equal(hae.recentRejects[0]?.auth_headers, null);
    assert.equal(fit.recentRejects.length, 1);
    assert.equal(fit.recentRejects[0]?.reason, "bad token");
    assert.equal(fit.recentRejects[0]?.status_code, 401);
    assert.equal(fit.recentRejects[0]?.auth_headers, null);
    assert.match(fit.recentRejects[0]?.received_at ?? "", ISO);
    assert.equal(JSON.stringify(body.ingest).includes(digest), false);
    assert.equal(JSON.stringify(body.ingest).includes(TOKEN), false);
    assert.equal(JSON.stringify(body.ingest).includes("phone-token"), false);
    assert.equal(Object.hasOwn(fit, "tokenUpdatedAt"), false);

    const old = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM ingest_attempts WHERE received_at < now() - interval '30 days'`,
    );
    assert.equal(Number(old[0]?.n), 0);
    const kept = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM ingest_attempts WHERE route = $1 AND reason = 'bad token'`,
      [FITNESS_INGEST_ROUTE],
    );
    assert.equal(Number(kept[0]?.n), 1);
  });

  it("still accepts a good post when the attempt log cannot be written", async () => {
    const inner = memorySql();
    setSqlClientForTests(inner);
    await migrate();
    process.env.FITNESS_INGEST_TOKEN = "phone-token";
    setSqlClientForTests({
      async query(text, params = []) {
        if (/insert\s+into\s+ingest_attempts/i.test(text)) throw new Error("log down");
        return inner.query(text, params);
      },
    });
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map((part) => String(part)).join(" "));
    };
    try {
      const saved = await postFit(
        { source: "shortcuts", date: "2026-10-13", steps: 80 },
        { authorization: "Bearer phone-token" },
      );
      assert.equal(saved.status, 200);
      assert.equal((await saved.json()).ok, true);
    } finally {
      console.error = original;
    }
    assert.equal(errors.some((line) => line.includes("ingest attempt log failed")), true);
    assert.equal(errors.some((line) => line.includes("phone-token")), false);
    const steps = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM fitness_metrics WHERE metric = 'step_count' AND day = '2026-10-13'`,
    );
    assert.equal(Number(steps[0]?.n), 1);
    const logged = await inner.query<{ n: string }>(`SELECT count(*)::text AS n FROM ingest_attempts`);
    assert.equal(Number(logged[0]?.n), 0);
  });

  it("lists header names and query or host flags without values", () => {
    const secret = "secretvalue";
    const headers = new Headers();
    headers.set("content-type", "application/json");
    headers.set("a-kept", secret);
    headers.set("bad_name", secret);
    headers.set("n".repeat(41), secret);
    for (let i = 0; i < 50; i += 1) headers.set(`m-${String(i).padStart(2, "0")}`, secret);
    headers.set("z-cut", secret);
    const url =
      "https://preview.example/api/fitness/ingest?token=" +
      secret +
      "&key=" +
      secret +
      "&api_key=" +
      secret +
      "&auth=" +
      secret +
      "&access_token=" +
      secret +
      "&ignored=" +
      secret;
    const names = rejectedAuthHeaderNames(new Request(url, { method: "POST", headers, body: "{}" }));
    const headerNames = names.filter((name) => /^[a-z0-9-]{1,40}$/.test(name));
    assert.equal(headerNames.length, 40);
    assert.equal(headerNames.includes("a-kept"), true);
    assert.equal(headerNames.includes("content-type"), true);
    assert.equal(headerNames.includes("z-cut"), false);
    assert.equal(names.includes("bad_name"), false);
    assert.equal(names.includes("n".repeat(41)), false);
    assert.deepEqual(
      names.filter((name) => name.startsWith("query:") || name === "host:other"),
      ["query:token", "query:key", "query:api_key", "query:auth", "query:access_token", "host:other"],
    );
    const dump = JSON.stringify(names);
    assert.equal(dump.includes(secret), false);
    assert.equal(dump.includes("preview.example"), false);
    assert.equal(dump.includes("ignored"), false);
    assert.equal(dump.includes("Bearer"), false);

    const canonical = rejectedAuthHeaderNames(
      new Request(FITNESS, {
        method: "POST",
        headers: { "x-api-key": secret, bad_name: secret, "content-type": "application/json" },
        body: "{}",
      }),
    );
    assert.equal(canonical.includes("x-api-key"), true);
    assert.equal(canonical.includes("bad_name"), false);
    assert.equal(canonical.includes("host:other"), false);
    assert.equal(JSON.stringify(canonical).includes(secret), false);

    const forwarded = rejectedAuthHeaderNames(
      new Request(FITNESS, {
        method: "POST",
        headers: { "x-forwarded-host": "other.example", "content-type": "application/json" },
        body: "{}",
      }),
    );
    assert.equal(forwarded.includes("host:other"), true);
    assert.equal(forwarded.includes("x-forwarded-host"), true);
    assert.equal(JSON.stringify(forwarded).includes("other.example"), false);

    const sameHost = rejectedAuthHeaderNames(
      new Request("https://preview.example/api/fitness/ingest", {
        method: "POST",
        headers: { "x-forwarded-host": "Resonance3.vercel.app:443" },
        body: "{}",
      }),
    );
    assert.equal(sameHost.includes("host:other"), false);
    assert.equal(JSON.stringify(sameHost).includes("preview.example"), false);

    const cased = rejectedAuthHeaderNames(
      new Request(`${FITNESS}?Token=${secret}&API_KEY=&access_token=${secret}`, {
        method: "POST",
        body: "{}",
      }),
    );
    assert.equal(cased.includes("query:token"), true);
    assert.equal(cased.includes("query:api_key"), true);
    assert.equal(cased.includes("query:access_token"), true);
    assert.equal(cased.includes("query:key"), false);
    assert.equal(JSON.stringify(cased).includes(secret), false);
  });

  it("accepts the extra headers and never stores a token value", async () => {
    const digest = hashHealthAutoExportToken(TOKEN);
    await saveHealthAutoExportTokenHash(digest);
    const secret = "secretvalue";
    const names = [
      "x-api-key",
      "api-key",
      "apikey",
      "x-auth-token",
      "x-access-token",
      "x-token",
      "token",
      "x-health-token",
    ];
    for (const [index, name] of names.entries()) {
      const day = `2026-11-${String(index + 1).padStart(2, "0")}`;
      const fit = await postFit({ source: "shortcuts", date: day, steps: 10 }, { [name]: "phone-token" });
      assert.equal(fit.status, 200);
      const hae = await postHae(steps, null, { [name]: TOKEN });
      assert.equal(hae.status, 200);
    }
    const tokenScheme = await postFit(
      { source: "shortcuts", date: "2026-11-20", steps: 11 },
      { authorization: "Token phone-token" },
    );
    assert.equal(tokenScheme.status, 200);
    const haeScheme = await postHae(steps, null, { authorization: `Token ${TOKEN}` });
    assert.equal(haeScheme.status, 200);

    const hub = await postFit({ source: "shortcuts", date: "2026-11-21", steps: 1 }, { "x-api-key": "hub-secret" });
    assert.equal(hub.status, 401);
    const haeHub = await postHae(steps, null, { "x-token": "hub-secret" });
    assert.equal(haeHub.status, 401);
    const haeOnFitness = await postFit(
      { source: "shortcuts", date: "2026-11-22", steps: 1 },
      { "x-api-key": TOKEN },
    );
    assert.equal(haeOnFitness.status, 401);

    const queryOnly = await postFitness(
      new Request(`${FITNESS}?token=phone-token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "phone-token", source: "shortcuts", date: "2026-11-24", steps: 4 }),
      }),
    );
    assert.equal(queryOnly.status, 401);

    const queryUrl = `${FITNESS}?token=${secret}&key=${secret}&api_key=${secret}&auth=${secret}&access_token=${secret}&ignored=${secret}`;
    const query = await postFitness(
      new Request(queryUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": secret,
          bad_name: secret,
          "x-forwarded-host": "other.example",
        },
        body: JSON.stringify({ token: secret, source: "shortcuts", date: "2026-11-23", steps: 1 }),
      }),
    );
    assert.equal(query.status, 401);
    assert.equal(JSON.stringify(await query.json()).includes(secret), false);

    const rows = await sqlQuery<{ reason: string; auth_headers: string | null }>(
      `SELECT reason, auth_headers FROM ingest_attempts WHERE status_code = 401 ORDER BY id`,
    );
    const dump = JSON.stringify(rows);
    assert.equal(dump.includes(secret), false);
    assert.equal(dump.includes(TOKEN), false);
    assert.equal(dump.includes("phone-token"), false);
    assert.equal(dump.includes("hub-secret"), false);
    assert.equal(dump.includes("other.example"), false);
    assert.equal(dump.includes(digest), false);
    const flagged = rows.map((row) => storedNames(row.auth_headers)).find((row) => row.includes("query:access_token"));
    assert.ok(flagged);
    assert.equal(flagged.includes("x-api-key"), true);
    assert.equal(flagged.includes("content-type"), true);
    assert.equal(flagged.includes("bad_name"), false);
    assert.equal(flagged.includes("query:key"), true);
    assert.equal(flagged.includes("query:api_key"), true);
    assert.equal(flagged.includes("query:auth"), true);
    assert.equal(flagged.includes("query:access_token"), true);
    assert.equal(flagged.includes("query:ignored"), false);
    assert.equal(flagged.includes("host:other"), true);
    assert.equal(flagged.includes("x-forwarded-host"), true);
  });

  it("returns the latest ten rejects and drops values from stored names", async () => {
    const now = Date.now();
    const leaked = "sekret=value";
    const count = 12;
    for (let i = 0; i < count; i += 1) {
      await sqlQuery(
        `INSERT INTO ingest_attempts (
           route, received_at, status_code, auth_ok, reason, user_agent, content_length, auth_headers
         ) VALUES ($1, $2::timestamptz, 401, false, 'missing header', $3, $4, $5)`,
        [
          FITNESS_INGEST_ROUTE,
          new Date(now - (count - i) * 1000).toISOString(),
          i === count - 1 ? "Agent" : null,
          20 + i,
          i === count - 1
            ? JSON.stringify(["content-type", leaked, "Query:Token", "host:other", "nope value", "n".repeat(41)])
            : null,
        ],
      );
    }
    await sqlQuery(
      `INSERT INTO ingest_attempts (route, received_at, status_code, auth_ok, reason)
       VALUES ($1, $2::timestamptz, 200, true, 'ok')`,
      [FITNESS_INGEST_ROUTE, new Date(now).toISOString()],
    );
    const live = await healthRequest("health-token");
    assert.equal(live.status, 200);
    const body = (await live.json()) as { ingest: IngestHealth };
    const rows: IngestRejectRow[] = body.ingest[FITNESS_INGEST_ROUTE].recentRejects;
    assert.equal(rows.length, 10);
    assert.deepEqual(
      rows.map((row) => row.content_length),
      [31, 30, 29, 28, 27, 26, 25, 24, 23, 22],
    );
    assert.equal(rows[0]?.user_agent, "Agent");
    assert.equal(rows[0]?.status_code, 401);
    assert.equal(rows[0]?.reason, "missing header");
    assert.deepEqual(rows[0]?.auth_headers, ["content-type", "query:token", "host:other"]);
    assert.equal(rows[1]?.auth_headers, null);
    assert.match(rows[0]?.received_at ?? "", ISO);
    assert.equal(Date.parse(rows[0]?.received_at ?? "") > Date.parse(rows[9]?.received_at ?? ""), true);
    assert.equal(body.ingest[HEALTH_AUTO_EXPORT_INGEST_ROUTE].recentRejects.length, 0);
    const dump = JSON.stringify(body.ingest);
    assert.equal(dump.includes(leaked), false);
    assert.equal(dump.includes("nope value"), false);
    assert.equal(dump.includes("n".repeat(41)), false);
  });
});
