import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";
import { FITNESS_INGEST_BODY_LIMIT, POST } from "@/app/api/fitness/ingest/route";
import { addCivilDays } from "@/lib/calendar-time";
import { loadFitnessCards, loadFitnessHome, loadFitnessNode, resetFitnessStoreForTests } from "@/lib/fitness-store";
import { sampleMetricsBody, sampleWorkoutsBody } from "@/lib/fitness-sample";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { isShortcutsPayload, parseFitnessIngest, parseShortcutInstant } from "@/lib/fitness-shortcuts";
import { parseHealthExport } from "@/lib/fitness-parse";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { migrate, migrateMigrations, migrationIdsInOrder } from "@/lib/pg/migrate";
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
    const stepsCard = cards.cards.find((card) => card.id === "steps");
    assert.equal(stepsCard?.title, "Steps");
    assert.equal(stepsCard?.headline, "1,300");
    const runsCard = cards.cards.find((card) => card.id === "runs");
    assert.equal(runsCard?.headline, "6.0 mi");
    const lifting = cards.cards.find((card) => card.id === "lifting");
    assert.equal(lifting?.headline, "1");
  });

  it("creates the fitness tables from embedded SQL when they are missing", async () => {
    setSqlClientForTests(createMemorySql());
    resetFitnessStoreForTests();
    const home = await loadFitnessHome("2026-10-07");
    assert.equal(home.availability, "live");
    assert.deepEqual(home.line, { value: "3.9", unit: "mi this week" });
    const steps = await sqlQuery<{ qty: string }>(
      `SELECT qty::text AS qty FROM fitness_metrics WHERE source = 'manual' AND metric = 'step_count'`,
    );
    assert.equal(Number(steps[0]?.qty), 21608);
  });

  it("keeps the floor up when the fitness read throws", async () => {
    setSqlClientForTests({
      async query() {
        throw new Error(
          "ENOENT: no such file or directory, scandir '/var/task/resonance-2/db/migrations'",
        );
      },
    });
    resetFitnessStoreForTests();
    const home = await loadFitnessHome("2026-10-07");
    assert.equal(home.availability, "unavailable");
    assert.deepEqual(home.line, { value: "3.9", unit: "mi this week" });
    const cards = await loadFitnessCards("2026-10-07");
    assert.equal(cards.availability, "unavailable");
    assert.equal(cards.cards.length, 4);
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

  it("parses shortcut dates in Chicago, including an 11:30 PM sample", () => {
    assert.equal(isShortcutsPayload(sampleMetricsBody), false);
    assert.deepEqual(parseFitnessIngest(sampleMetricsBody), parseHealthExport(sampleMetricsBody));
    assert.equal(parseShortcutInstant("Oct 8, 2026 at 11:30 PM")?.day, "2026-10-08");
    assert.equal(parseShortcutInstant("Oct 8, 2026 at 9:14 PM")?.day, "2026-10-08");
    assert.equal(parseShortcutInstant("2026-10-08T23:30:00")?.day, "2026-10-08");
    assert.equal(parseShortcutInstant("2026-10-09T04:30:00Z")?.day, "2026-10-08");
    assert.equal(parseShortcutInstant("Oct 9, 2026 at 12:30 AM")?.day, "2026-10-09");
    assert.equal(parseShortcutInstant("Sep 1, 2026 at 12:01 AM")?.day, "2026-09-01");
    assert.equal(parseShortcutInstant("not a date"), null);
  });

  it("replaces shortcut days and does not double-count an overlapping window", async () => {
    const nightly = {
      source: "shortcuts",
      metrics: [
        {
          metric: "steps",
          values: [100, "50", 80, 20],
          starts: [
            "Oct 7, 2026 at 8:00 AM",
            "Oct 7, 2026 at 6:00 PM",
            "Oct 8, 2026 at 9:00 AM",
            "Oct 8, 2026 at 11:30 PM",
          ],
        },
        {
          metric: "distance",
          values: "1.5\n2.25",
          starts: "Oct 8, 2026 at 8:00 AM\nOct 8, 2026 at 5:00 PM",
        },
        {
          metric: "active_energy",
          values: ["410"],
          starts: ["2026-10-09T04:30:00Z"],
        },
        {
          metric: "workouts",
          values: [32],
          starts: ["Oct 8, 2026 at 7:00 AM"],
          units: "min",
        },
      ],
    };
    const first = await ingest(nightly, { authorization: "", "x-fitness-token": TOKEN });
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    const second = await ingest(nightly, { authorization: "", "x-fitness-token": TOKEN });
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), firstBody);

    const overlap = {
      source: "shortcuts",
      metric: "steps",
      values: [30, 25, 40],
      starts: ["Oct 8, 2026 at 9:00 AM", "Oct 8, 2026 at 11:30 PM", "Oct 9, 2026 at 7:00 AM"],
    };
    const overlapped = await ingest(overlap);
    assert.equal(overlapped.status, 200);

    const rows = await sqlQuery<{ day: unknown; qty: string }>(
      `SELECT day, qty::text AS qty
       FROM fitness_metrics
       WHERE source = 'shortcuts' AND metric = 'step_count'
       ORDER BY day`,
    );
    const civil = (value: unknown) =>
      value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").slice(0, 10);
    assert.deepEqual(
      rows.map((row) => [civil(row.day), Number(row.qty)]),
      [
        ["2026-10-07", 150],
        ["2026-10-08", 55],
        ["2026-10-09", 40],
      ],
    );
    const counts = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM fitness_metrics WHERE source = 'shortcuts' AND metric = 'step_count' AND day = '2026-10-08'`,
    );
    assert.equal(Number(counts[0]?.n), 1);

    const detail = await loadFitnessNode("steps", "2026-10-09");
    assert.equal(detail.detail?.title, "Steps");
    assert.equal(detail.detail?.rows.some((row) => row.id === "2026-10-06"), false);
    assert.equal(detail.detail?.rows.some((row) => row.primary === "0 steps"), false);
    const october8 = detail.detail?.rows.find((row) => row.id === "2026-10-08");
    assert.equal(october8?.primary, "55 steps");
    assert.match(october8?.secondary ?? "", /410 kcal/);
    assert.match(october8?.secondary ?? "", /3\.8 mi/);
    assert.match(october8?.secondary ?? "", /32 min/);
  });

  it("backfills from 2026-09-01 in chunks without stacking", async () => {
    const days = 10;
    const values: number[] = [];
    const starts: string[] = [];
    for (let index = 0; index < days; index += 1) {
      const day = addCivilDays("2026-09-01", index);
      values.push(1000 + index, 5);
      starts.push(`${day}T08:00:00`, `${day}T23:30:00`);
    }
    const chunk = { source: "shortcuts", metric: "steps", values, starts };
    assert.equal((await ingest(chunk)).status, 200);
    assert.equal((await ingest(chunk)).status, 200);
    const stored = await sqlQuery<{ n: string; qty: string }>(
      `SELECT count(*)::text AS n,
              max(CASE WHEN day = '2026-09-01' THEN qty::text END) AS qty
       FROM fitness_metrics
       WHERE source = 'shortcuts' AND metric = 'step_count'`,
    );
    assert.equal(Number(stored[0]?.n), days);
    assert.equal(Number(stored[0]?.qty), 1005);

    const later = {
      source: "shortcuts",
      metric: "steps",
      values: [7],
      starts: ["2026-09-10T23:30:00"],
    };
    await ingest(later);
    const edge = await sqlQuery<{ qty: string; n: string }>(
      `SELECT qty::text AS qty, count(*)::text AS n
       FROM fitness_metrics
       WHERE source = 'shortcuts' AND metric = 'step_count' AND day = '2026-09-10'
       GROUP BY qty`,
    );
    assert.equal(edge.length, 1);
    assert.equal(Number(edge[0]?.qty), 7);
    assert.equal(Number(edge[0]?.n), 1);
    const earlier = await sqlQuery<{ qty: string }>(
      `SELECT qty::text AS qty FROM fitness_metrics
       WHERE source = 'shortcuts' AND metric = 'step_count' AND day = '2026-09-01'`,
    );
    assert.equal(Number(earlier[0]?.qty), 1005);
  });

  it("rejects a body larger than the backfill limit", async () => {
    const response = await POST(
      new Request("https://resonance3.vercel.app/api/fitness/ingest", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-fitness-token": TOKEN,
        },
        body: `{"pad":"${"a".repeat(FITNESS_INGEST_BODY_LIMIT)}"}`,
      }),
    );
    assert.equal(response.status, 413);
  });

  it("applies migration 007 when 006 is absent", async () => {
    assert.deepEqual(
      migrationIdsInOrder(["007_fitness_shortcuts", "002_fitness", "006_other", "005_auth"]),
      ["002_fitness", "005_auth", "006_other", "007_fitness_shortcuts"],
    );
    const result = await migrateMigrations([
      { id: "007_fitness_shortcuts", sql: "SELECT 1" },
    ]);
    assert.deepEqual(result.applied, ["007_fitness_shortcuts"]);
    const ids = await sqlQuery<{ id: string }>(`SELECT id FROM schema_migrations ORDER BY id`);
    assert.deepEqual(
      ids.map((row) => row.id),
      [
        "001_domain_tables",
        "002_fitness",
        "003_bet_tier",
        "004_fight_breakdowns",
        "005_auth",
        "007_fitness_shortcuts",
        "009_reset_rh_agentic_sleeves",
      ],
    );
    assert.equal(
      ids.some((row) => row.id.startsWith("006")),
      false,
    );
    const again = await migrate();
    assert.equal(again.applied.includes("009_reset_rh_agentic_sleeves"), false);
    assert.equal(again.skipped.includes("009_reset_rh_agentic_sleeves"), true);
  });
});

describe("production migrate gate", () => {
  it("embeds the migration files so runtime does not scan the folder", async () => {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../db/migrations");
    for (const migration of EMBEDDED_MIGRATIONS) {
      const file = await readFile(path.join(dir, `${migration.id}.sql`), "utf8");
      assert.equal(migration.sql, file);
    }
  });

  it("migrates only production builds that have a database url", () => {
    assert.equal(shouldMigrateOnBuild({ VERCEL_ENV: "production", DATABASE_URL: "postgres://db" }), true);
    assert.equal(shouldMigrateOnBuild({ VERCEL_ENV: "preview", DATABASE_URL: "postgres://db" }), false);
    assert.equal(shouldMigrateOnBuild({ VERCEL_ENV: "production" }), false);
    assert.equal(shouldMigrateOnBuild({}), false);
  });
});
