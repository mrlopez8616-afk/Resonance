import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";
import { FITNESS_INGEST_BODY_LIMIT, POST } from "@/app/api/fitness/ingest/route";
import { GET as getRuns } from "@/app/api/fitness/runs/route";
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

  it("keeps the larger shortcuts day and does not double-count an overlapping window", async () => {
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
        ["2026-10-08", 100],
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
    assert.equal(october8?.primary, "100 steps");
    assert.match(october8?.secondary ?? "", /410 kcal/);
    assert.match(october8?.secondary ?? "", /3\.8 mi/);
    assert.match(october8?.secondary ?? "", /32 min/);
  });

  it("does not let a 9 PM nightly slice shrink a full shortcuts day", async () => {
    const fullDay = {
      source: "shortcuts",
      metric: "steps",
      values: [4000, 3500, 2125],
      starts: ["Oct 6, 2026 at 8:00 AM", "Oct 6, 2026 at 1:00 PM", "Oct 6, 2026 at 6:00 PM"],
    };
    const first = await ingest(fullDay);
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    const replay = await ingest(fullDay);
    assert.deepEqual(await replay.json(), firstBody);

    const nightlySlice = {
      source: "shortcuts",
      metric: "steps",
      values: [180, 40],
      starts: ["Oct 6, 2026 at 9:00 PM", "Oct 6, 2026 at 11:30 PM"],
    };
    assert.equal((await ingest(nightlySlice)).status, 200);
    const sliceAgain = await ingest(nightlySlice);
    assert.equal(sliceAgain.status, 200);
    const kept = await sqlQuery<{ qty: string; n: string }>(
      `SELECT qty::text AS qty, count(*)::text AS n
       FROM fitness_metrics
       WHERE source = 'shortcuts' AND metric = 'step_count' AND day = '2026-10-06'
       GROUP BY qty`,
    );
    assert.equal(kept.length, 1);
    assert.equal(Number(kept[0]?.qty), 9625);
    assert.equal(Number(kept[0]?.n), 1);

    const larger = {
      source: "shortcuts",
      metric: "steps",
      values: [7000, 3000],
      starts: ["Oct 6, 2026 at 8:00 AM", "Oct 6, 2026 at 9:14 PM"],
    };
    const raised = await ingest(larger);
    const raisedAgain = await ingest(larger);
    assert.deepEqual(await raisedAgain.json(), await raised.json());
    const replaced = await sqlQuery<{ qty: string }>(
      `SELECT qty::text AS qty FROM fitness_metrics
       WHERE source = 'shortcuts' AND metric = 'step_count' AND day = '2026-10-06'`,
    );
    assert.equal(Number(replaced[0]?.qty), 10000);
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

    const partial = {
      source: "shortcuts",
      metric: "steps",
      values: [7],
      starts: ["2026-09-10T23:30:00"],
    };
    await ingest(partial);
    const edge = await sqlQuery<{ qty: string; n: string }>(
      `SELECT qty::text AS qty, count(*)::text AS n
       FROM fitness_metrics
       WHERE source = 'shortcuts' AND metric = 'step_count' AND day = '2026-09-10'
       GROUP BY qty`,
    );
    assert.equal(edge.length, 1);
    assert.equal(Number(edge[0]?.qty), 1014);
    assert.equal(Number(edge[0]?.n), 1);
    const raised = {
      source: "shortcuts",
      metric: "steps",
      values: [2500],
      starts: ["2026-09-10T08:00:00"],
    };
    const raisedBody = await (await ingest(raised)).json();
    const raisedAgain = await (await ingest(raised)).json();
    assert.deepEqual(raisedAgain, raisedBody);
    const replaced = await sqlQuery<{ qty: string }>(
      `SELECT qty::text AS qty FROM fitness_metrics
       WHERE source = 'shortcuts' AND metric = 'step_count' AND day = '2026-09-10'`,
    );
    assert.equal(Number(replaced[0]?.qty), 2500);
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

  it("keeps an old shortcuts payload on the larger daily total and stores no runs", async () => {
    const body = {
      source: "shortcuts",
      metric: "steps",
      values: [4000, 1000],
      starts: ["Oct 6, 2026 at 8:00 AM", "Oct 6, 2026 at 9:00 PM"],
    };
    assert.equal((await ingest(body)).status, 200);
    const smaller = await ingest({
      source: "shortcuts",
      metric: "steps",
      values: [50],
      starts: ["Oct 6, 2026 at 11:00 PM"],
    });
    const smallerBody = await smaller.json();
    assert.equal(smallerBody.runs, 0);
    const steps = await sqlQuery<{ qty: string }>(
      `SELECT qty::text AS qty FROM fitness_metrics
       WHERE source = 'shortcuts' AND metric = 'step_count' AND day = '2026-10-06'`,
    );
    assert.equal(Number(steps[0]?.qty), 5000);
    const runs = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM fitness_shortcut_workouts`,
    );
    assert.equal(Number(runs[0]?.n), 0);
  });

  it("normalizes workout units, stores pace, and does not double-count a re-send", async () => {
    const workouts = [
      {
        type: "Running",
        source: "Nike Run Club",
        start: "2026-10-06T18:04:00-05:00",
        duration: 30,
        durationUnit: "min",
        distance: 5,
        distanceUnit: "km",
        energy: "320 kcal",
      },
      {
        type: "Walking",
        source: "Apple Watch",
        start: "2026-10-06T07:15:00-05:00",
        duration: "1200 s",
        distance: { qty: 1.5, units: "mi" },
      },
      {
        type: "Cycling",
        source: "Nike Run Club",
        start: "2026-10-06T12:00:00-05:00",
        duration: 40,
        durationUnit: "min",
      },
    ];
    const first = await ingest({
      source: "shortcuts",
      metric: "steps",
      values: [100],
      starts: ["Oct 6, 2026 at 8:00 AM"],
      workouts,
    });
    assert.equal(first.status, 200);
    assert.equal((await first.json()).runs, 2);
    const again = await ingest({
      source: "shortcuts",
      workouts,
    });
    assert.equal(again.status, 200);
    const rows = await sqlQuery<{
      type: string;
      source_name: string | null;
      duration_sec: string;
      distance_m: string | null;
      energy_kcal: string | null;
      pace_sec_per_km: string | null;
      pace_sec_per_mi: string | null;
    }>(
      `SELECT type, source_name, duration_sec::text AS duration_sec, distance_m::text AS distance_m,
              energy_kcal::text AS energy_kcal, pace_sec_per_km::text AS pace_sec_per_km,
              pace_sec_per_mi::text AS pace_sec_per_mi
       FROM fitness_shortcut_workouts
       ORDER BY type`,
    );
    assert.equal(rows.length, 2);
    const run = rows.find((row) => row.type === "Running");
    assert.equal(run?.source_name, "Nike Run Club");
    assert.equal(Number(run?.duration_sec), 1800);
    assert.equal(Number(run?.distance_m), 5000);
    assert.equal(Number(run?.energy_kcal), 320);
    assert.equal(Number(run?.pace_sec_per_km), 360);
    const walk = rows.find((row) => row.type === "Walking");
    assert.equal(Number(walk?.duration_sec), 1200);
    assert.ok(Math.abs(Number(walk?.distance_m) - 1.5 * 1609.344) < 0.01);
    assert.equal(walk?.energy_kcal, null);
    assert.ok(Math.abs(Number(walk?.pace_sec_per_mi) - 800) < 0.05);
    assert.ok(Number(walk?.pace_sec_per_km) > 0);
  });

  it("fills nulls on conflict and keeps the latest present values", async () => {
    const start = "2026-10-07T06:30:00-05:00";
    const sparse = await ingest({
      source: "shortcuts",
      workouts: [
        {
          type: "Running",
          start,
          duration: 1500,
          durationUnit: "s",
          energy: 200,
          energyUnit: "kcal",
        },
      ],
    });
    assert.equal(sparse.status, 200);
    const richer = await ingest({
      source: "shortcuts",
      workouts: [
        {
          type: "Running",
          source: "Nike Run Club",
          start: "2026-10-07T11:30:00Z",
          duration: 25,
          durationUnit: "min",
          distance: 4,
          distanceUnit: "km",
        },
      ],
    });
    assert.equal(richer.status, 200);
    const rows = await sqlQuery<{
      n: string;
      source_name: string | null;
      duration_sec: string;
      distance_m: string | null;
      energy_kcal: string | null;
      pace_sec_per_km: string | null;
    }>(
      `SELECT count(*)::text AS n, max(source_name) AS source_name,
              max(duration_sec)::text AS duration_sec, max(distance_m)::text AS distance_m,
              max(energy_kcal)::text AS energy_kcal, max(pace_sec_per_km)::text AS pace_sec_per_km
       FROM fitness_shortcut_workouts`,
    );
    assert.equal(rows[0]?.n, "1");
    assert.equal(rows[0]?.source_name, "Nike Run Club");
    assert.equal(Number(rows[0]?.duration_sec), 1500);
    assert.equal(Number(rows[0]?.distance_m), 4000);
    assert.equal(Number(rows[0]?.energy_kcal), 200);
    assert.equal(Number(rows[0]?.pace_sec_per_km), 375);

    const named = await ingest({
      source: "shortcuts",
      workouts: [
        {
          type: "Running",
          source: "Watch",
          start,
          duration: 1600,
          durationUnit: "s",
        },
      ],
    });
    assert.equal(named.status, 200);
    const updated = await sqlQuery<{
      source_name: string | null;
      duration_sec: string;
      distance_m: string | null;
      energy_kcal: string | null;
      pace_sec_per_km: string | null;
    }>(
      `SELECT source_name, duration_sec::text AS duration_sec, distance_m::text AS distance_m,
              energy_kcal::text AS energy_kcal, pace_sec_per_km::text AS pace_sec_per_km
       FROM fitness_shortcut_workouts`,
    );
    assert.equal(updated[0]?.source_name, "Watch");
    assert.equal(Number(updated[0]?.duration_sec), 1600);
    assert.equal(Number(updated[0]?.distance_m), 4000);
    assert.equal(Number(updated[0]?.energy_kcal), 200);
    assert.equal(Number(updated[0]?.pace_sec_per_km), 400);
  });

  it("derives distance from the post, then lets a later explicit distance replace it", async () => {
    const start = "2026-10-03T07:00:00-05:00";
    const samples = {
      metric: "distance",
      units: "km",
      values: [1.5, 4],
      starts: ["2026-10-03T07:10:00-05:00", "2026-10-03T09:00:00-05:00"],
      sources: ["Nike Run Club", "Nike Run Club"],
    };
    const derived = await ingest({
      source: "shortcuts",
      metrics: [samples, { metric: "steps", values: [10], starts: ["Oct 3, 2026 at 8:00 AM"] }],
      workouts: [
        { type: "Running", source: "Nike Run Club", start, duration: 30, durationUnit: "min" },
      ],
    });
    assert.equal(derived.status, 200);
    const first = await sqlQuery<{
      distance_m: string | null;
      distance_source: string | null;
      pace_sec_per_km: string | null;
    }>(
      `SELECT distance_m::text AS distance_m, distance_source, pace_sec_per_km::text AS pace_sec_per_km
       FROM fitness_shortcut_workouts`,
    );
    assert.equal(Number(first[0]?.distance_m), 1500);
    assert.equal(first[0]?.distance_source, "derived");
    assert.equal(Number(first[0]?.pace_sec_per_km), 1200);

    const explicit = await ingest({
      source: "shortcuts",
      workouts: [
        {
          type: "Running",
          source: "Nike Run Club",
          start,
          duration: 30,
          durationUnit: "min",
          distance: 4,
          distanceUnit: "km",
        },
      ],
    });
    assert.equal(explicit.status, 200);
    const second = await sqlQuery<{
      distance_m: string | null;
      distance_source: string | null;
      pace_sec_per_km: string | null;
    }>(
      `SELECT distance_m::text AS distance_m, distance_source, pace_sec_per_km::text AS pace_sec_per_km
       FROM fitness_shortcut_workouts`,
    );
    assert.equal(Number(second[0]?.distance_m), 4000);
    assert.equal(second[0]?.distance_source, "workout");
    assert.equal(Number(second[0]?.pace_sec_per_km), 450);

    const again = await ingest({
      source: "shortcuts",
      metrics: [
        {
          metric: "distance",
          units: "km",
          values: [9],
          starts: ["2026-10-03T07:12:00-05:00"],
          sources: ["iPhone"],
        },
      ],
      workouts: [
        { type: "Running", source: "Nike Run Club", start, duration: 30, durationUnit: "min" },
      ],
    });
    assert.equal(again.status, 200);
    const kept = await sqlQuery<{
      distance_m: string | null;
      distance_source: string | null;
      pace_sec_per_km: string | null;
    }>(
      `SELECT distance_m::text AS distance_m, distance_source, pace_sec_per_km::text AS pace_sec_per_km
       FROM fitness_shortcut_workouts`,
    );
    assert.equal(Number(kept[0]?.distance_m), 4000);
    assert.equal(kept[0]?.distance_source, "workout");
    assert.equal(Number(kept[0]?.pace_sec_per_km), 450);
  });

  it("rejects a bad workout without writing the daily total", async () => {
    const response = await ingest({
      source: "shortcuts",
      metric: "steps",
      values: [800],
      starts: ["Oct 8, 2026 at 9:00 AM"],
      workouts: [{ type: "Running", start: "2026-10-08T09:00:00", duration: 10, durationUnit: "min" }],
    });
    assert.equal(response.status, 400);
    const meters = await ingest({
      source: "shortcuts",
      workouts: [
        {
          type: "Running",
          start: "2026-10-08T09:00:00-05:00",
          duration: 10,
          durationUnit: "min",
          distance: 1,
          distanceUnit: "meters",
        },
      ],
    });
    assert.equal(meters.status, 400);
    const capped = await ingest({
      source: "shortcuts",
      workouts: Array.from({ length: 401 }, (_, index) => ({
        type: index % 2 === 0 ? "Running" : "Walking",
        start: `2026-10-08T09:${String(index % 60).padStart(2, "0")}:00-05:00`,
        duration: 10,
        durationUnit: "min",
      })),
    });
    assert.equal(capped.status, 400);
    const steps = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM fitness_metrics WHERE source = 'shortcuts'`,
    );
    const runs = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM fitness_shortcut_workouts`,
    );
    assert.equal(Number(steps[0]?.n), 0);
    assert.equal(Number(runs[0]?.n), 0);
  });

  it("requires a session or the sync bearer to read runs", async () => {
    const closed = await getRuns(new Request("https://resonance3.vercel.app/api/fitness/runs"));
    assert.equal(closed.status, 401);
    const opened = await getRuns(
      new Request("https://resonance3.vercel.app/api/fitness/runs", {
        headers: { authorization: "Bearer hub-secret" },
      }),
    );
    assert.equal(opened.status, 200);
    const body = await opened.json();
    assert.equal(body.ok, true);
    assert.equal(body.runs.length >= 2, true);
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
        "008_finance",
        "009_reset_rh_agentic_sleeves",
        "010_fitness_workouts",
        "011_xrp_agentic_sleeve",
        "012_sui_agentic_sleeve",
        "013_sui_coinbase_backfill",
        "014_cb_agentic_xrp",
        "015_dedupe_retagged_fills",
        "016_build_items",
        "019_dedupe_fill_keys",
        "020_sui_cb_agentic_transfer",
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
