import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { newDb } from "pg-mem";
import { POST } from "@/app/api/fitness/ingest/route";
import { loadFitnessCards, loadFitnessHome, resetFitnessStoreForTests } from "@/lib/fitness-store";
import { sampleMetricsBody, sampleWorkoutsBody } from "@/lib/fitness-sample";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { migrate } from "@/lib/pg/migrate";
import { shouldMigrateOnBuild } from "@/lib/pg/prebuild";

const TOKEN = "phone-token";

function createMemorySql(): SqlClient {
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

function ingest(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request("https://resonance3.vercel.app/api/fitness/ingest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${TOKEN}`,
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("fitness ingest", { concurrency: false }, () => {
  const previous = {
    databaseUrl: process.env.DATABASE_URL,
    token: process.env.FITNESS_INGEST_TOKEN,
    secret: process.env.RESONANCE_SYNC_SECRET,
  };

  after(() => {
    if (previous.databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.databaseUrl;
    if (previous.token === undefined) delete process.env.FITNESS_INGEST_TOKEN;
    else process.env.FITNESS_INGEST_TOKEN = previous.token;
    if (previous.secret === undefined) delete process.env.RESONANCE_SYNC_SECRET;
    else process.env.RESONANCE_SYNC_SECRET = previous.secret;
    setSqlClientForTests(null);
    resetFitnessStoreForTests();
  });

  beforeEach(async () => {
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    process.env.FITNESS_INGEST_TOKEN = TOKEN;
    process.env.RESONANCE_SYNC_SECRET = "hub-secret";
    resetFitnessStoreForTests();
    setSqlClientForTests(createMemorySql());
    await migrate();
  });

  it("rejects a missing token, the hub secret, and an empty body", async () => {
    delete process.env.FITNESS_INGEST_TOKEN;
    const closed = await ingest(sampleMetricsBody);
    assert.equal(closed.status, 503);

    process.env.FITNESS_INGEST_TOKEN = TOKEN;
    const hub = await ingest(sampleMetricsBody, { authorization: "Bearer hub-secret" });
    assert.equal(hub.status, 401);

    const empty = await ingest({});
    assert.equal(empty.status, 400);
  });

  it("upserts a re-sent day and workout, and accepts the custom header", async () => {
    const headerOnly = await ingest(sampleMetricsBody, {
      authorization: "",
      "x-fitness-token": TOKEN,
    });
    assert.equal(headerOnly.status, 200);
    assert.equal((await headerOnly.json()).metrics, 5);

    const updated = {
      data: {
        metrics: [
          {
            name: "step_count",
            units: "count",
            data: [{ qty: 1300, date: "2026-10-06 00:00:00 -0500", source: "Andres's iPhone" }],
          },
        ],
      },
    };
    const again = await ingest(updated);
    assert.equal(again.status, 200);

    const steps = await sqlQuery<{ qty: string; n: string }>(
      `SELECT qty::text AS qty, count(*)::text AS n
       FROM fitness_metrics
       WHERE external_id = 'step_count:2026-10-06:count'
       GROUP BY qty`,
    );
    assert.equal(steps.length, 1);
    assert.equal(Number(steps[0]?.qty), 1300);
    assert.equal(Number(steps[0]?.n), 1);

    const workouts = await ingest(sampleWorkoutsBody);
    assert.equal(workouts.status, 200);
    await ingest(sampleWorkoutsBody);
    const runs = await sqlQuery<{ n: string; payload: unknown }>(
      `SELECT count(*)::text AS n, max(payload::text) AS payload
       FROM fitness_workouts WHERE external_id = 'nrc-sample-1'`,
    );
    assert.equal(Number(runs[0]?.n), 1);
    assert.equal(String(runs[0]?.payload).includes("latitude"), false);

    const home = await loadFitnessHome("2026-10-07");
    assert.equal(home.availability, "live");
    assert.deepEqual(home.line, { value: "6.0", unit: "mi this week" });
    const cards = await loadFitnessCards("2026-10-07");
    const activity = cards.cards.find((card) => card.id === "activity");
    assert.equal(activity?.headline, "1,300");
    const runsCard = cards.cards.find((card) => card.id === "runs");
    assert.equal(runsCard?.headline, "6.0 mi");
    const lifting = cards.cards.find((card) => card.id === "lifting");
    assert.equal(lifting?.headline, "1");
  });

  it("applies the fitness migration when the table is missing", async () => {
    setSqlClientForTests(createMemorySql());
    resetFitnessStoreForTests();
    const home = await loadFitnessHome("2026-10-07");
    assert.equal(home.availability, "live");
    assert.deepEqual(home.line, { value: "3.9", unit: "mi this week" });
    const applied = await sqlQuery<{ id: string }>(
      `SELECT id FROM schema_migrations WHERE id = '002_fitness'`,
    );
    assert.equal(applied.length, 1);
  });

  it("seeds the manual day through the store once", async () => {
    const first = await loadFitnessHome("2026-10-07");
    assert.equal(first.availability, "live");
    const second = await loadFitnessHome("2026-10-07");
    assert.deepEqual(second.line, first.line);
    const runs = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM fitness_workouts WHERE source = 'manual'`,
    );
    assert.equal(Number(runs[0]?.n), 2);
    const steps = await sqlQuery<{ qty: string }>(
      `SELECT qty::text AS qty FROM fitness_metrics WHERE source = 'manual' AND metric = 'step_count'`,
    );
    assert.equal(Number(steps[0]?.qty), 21608);
  });
});

describe("production migrate gate", () => {
  it("migrates only production builds that have a database url", () => {
    assert.equal(shouldMigrateOnBuild({ VERCEL_ENV: "production", DATABASE_URL: "postgres://db" }), true);
    assert.equal(shouldMigrateOnBuild({ VERCEL_ENV: "preview", DATABASE_URL: "postgres://db" }), false);
    assert.equal(shouldMigrateOnBuild({ VERCEL_ENV: "production" }), false);
    assert.equal(shouldMigrateOnBuild({}), false);
  });
});
