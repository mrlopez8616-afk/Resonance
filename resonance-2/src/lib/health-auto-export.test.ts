import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createElement, isValidElement, type ReactNode } from "react";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { hash } from "@node-rs/argon2";
import { newDb } from "pg-mem";
import { POST as ingest } from "@/app/api/ingest/health-auto-export/route";
import { GET as getRuns } from "@/app/api/fitness/runs/route";
import { POST as rotateToken } from "@/app/api/settings/health-auto-export-token/route";
import { SESSION_COOKIE } from "@/lib/auth-core";
import { createSession } from "@/lib/auth-store";
import { fitnessHomeFace } from "@/lib/home-faces";
import { publicFitnessDetail } from "@/lib/fitness-board";
import { buildFitnessStory } from "@/lib/fitness-story";
import {
  HEALTH_AUTO_EXPORT_BODY_LIMIT,
  HEALTH_AUTO_EXPORT_DB_BATCH,
  HEALTH_AUTO_EXPORT_HEADER,
  HEALTH_AUTO_EXPORT_HEADER_NAME,
  HEALTH_AUTO_EXPORT_URL,
  hashHealthAutoExportToken,
  healthAutoExportTokenMatches,
  normalizeDistance,
  parseHealthAutoExport,
} from "@/lib/health-auto-export";
import { saveHealthAutoExportTokenHash } from "@/lib/health-auto-export-store";
import { loadFitnessBundle, loadFitnessNode, resetFitnessStoreForTests } from "@/lib/fitness-store";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { migrate } from "@/lib/pg/migrate";
import { PUBLIC_MODE_COOKIE } from "@/lib/public-mode";

const cssRequire = createRequire(import.meta.url);
const nodeModule = cssRequire("module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = nodeModule._load;
nodeModule._load = function load(request: string, parent: unknown, isMain: boolean) {
  const normalized = request.replace(/\\/g, "/");
  if (normalized === "next/link" || normalized.includes("next/dist/client/link")) {
    return {
      __esModule: true,
      default: function LinkStandIn(props: { href?: string; children?: ReactNode; className?: string }) {
        return createElement("a", { href: props.href ?? "", className: props.className }, props.children);
      },
    };
  }
  return originalLoad(request, parent, isMain);
};

function render(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((child) => render(child)).join("");
  if (!isValidElement(node)) return "";
  const type = node.type;
  if (typeof type === "function") return render((type as (props: unknown) => ReactNode)(node.props));
  const props = node.props as { children?: ReactNode };
  return render(props.children);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ENDPOINT = "https://resonance3.vercel.app/api/ingest/health-auto-export";
const TOKEN_ENDPOINT = "https://resonance3.vercel.app/api/settings/health-auto-export-token";

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

const aggregatedSteps = {
  data: {
    metrics: [
      {
        name: "step_count",
        units: "count",
        data: [
          { qty: 8421, date: "2026-09-01 00:00:00 -0500", source: "Andres's Apple Watch" },
          { qty: 9100, date: "2026-09-02 00:00:00 -0500", source: "Andres's Apple Watch" },
        ],
      },
    ],
  },
};

const sampleSteps = {
  data: {
    metrics: [
      {
        name: "step_count",
        units: "count",
        data: [
          { qty: 1.25, date: "2026-09-03 08:00:00 -0500", source: "Apple Watch" },
          { qty: 2.75, date: "2026-09-03 08:00:01 -0500", source: "Apple Watch" },
          { qty: 4, date: "2026-09-03 18:00:00 -0500", source: "iPhone" },
          { qty: 0.5, date: "2026-09-02 23:30:00 -0500", source: "Apple Watch" },
        ],
      },
    ],
  },
};

const nrcWorkout = {
  data: {
    workouts: [
      {
        id: "nrc-2026-09-12",
        name: "Running",
        start: "2026-09-12 06:40:00 -0500",
        end: "2026-09-12 07:22:00 -0500",
        duration: 2520,
        source: "Nike Run Club",
        distance: { qty: 5.2, units: "km" },
        activeEnergyBurned: { qty: 420, units: "kcal" },
        heartRate: {
          avg: { qty: 154, units: "bpm" },
          max: { qty: 176, units: "bpm" },
        },
        route: [{ latitude: 41.881, longitude: -87.623, timestamp: "2026-09-12 06:40:00 -0500" }],
        heartRateData: [{ date: "2026-09-12 06:41:00 -0500", Min: 120, Avg: 154, Max: 160 }],
      },
    ],
  },
};

function postIngest(body: unknown, token: string | null, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", ...extra };
  if (token) headers[HEALTH_AUTO_EXPORT_HEADER] = token;
  return ingest(
    new Request(ENDPOINT, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("health auto export parse", () => {
  it("sums a daily aggregate and per-sample steps on the Chicago day", () => {
    const daily = parseHealthAutoExport(aggregatedSteps);
    assert.deepEqual(
      daily.metrics.map((row) => [row.day, row.qty, row.externalId]),
      [
        ["2026-09-01", "8421", "step_count:2026-09-01:count"],
        ["2026-09-02", "9100", "step_count:2026-09-02:count"],
      ],
    );
    const samples = parseHealthAutoExport(sampleSteps);
    const sept3 = samples.metrics.find((row) => row.day === "2026-09-03");
    assert.equal(sept3?.qty, "4");
    assert.equal(sept3?.externalId, "step_count:2026-09-03:count");
    const late = samples.metrics.find((row) => row.day === "2026-09-02");
    assert.equal(late?.qty, "0.5");
  });

  it("keeps miles and kilometers for a Nike Run Club run and drops the route", () => {
    const parsed = parseHealthAutoExport(nrcWorkout);
    const run = parsed.workouts[0];
    assert.equal(parsed.workouts.length, 1);
    assert.equal(run?.externalId, "nrc-2026-09-12");
    assert.equal(run?.name, "Running");
    assert.equal(run?.distanceUnits, "mi");
    assert.equal(run?.energyKcal, "420");
    assert.equal(run?.heartRateAvg, "154");
    assert.equal(run?.heartRateMax, "176");
    const distance = normalizeDistance(5.2, "km");
    assert.ok(distance);
    assert.ok(Math.abs(Number(run?.distanceQty) - distance.miles) < 0.0001);
    const payload = run?.payload as { miles?: string; km?: string; source?: string };
    assert.equal(payload.source, "Nike Run Club");
    assert.ok(Math.abs(Number(payload.km) - 5.2) < 0.001);
    assert.equal(JSON.stringify(run?.payload).includes("41.881"), false);
    assert.equal(JSON.stringify(run?.payload).includes("heartRateData"), false);
    const again = parseHealthAutoExport({
      data: {
        workouts: [
          {
            name: "Running",
            start: "2026-09-04 07:00:00 -0500",
            end: "2026-09-04 07:30:00 -0500",
            duration: 1800,
            distance: { qty: 3, units: "mi" },
            energy: { qty: 300, units: "kcal" },
          },
        ],
      },
    });
    const hashed = again.workouts[0]?.externalId ?? "";
    assert.equal(hashed.length, 64);
    assert.equal(again.workouts[0]?.externalId, parseHealthAutoExport({
      data: {
        workouts: [
          {
            name: "Running",
            start: "2026-09-04 07:00:00 -0500",
            duration: 1800,
          },
        ],
      },
    }).workouts[0]?.externalId);
  });

  it("compares the digest in constant time and ignores a short hash", () => {
    const token = "sample-token";
    const digest = hashHealthAutoExportToken(token);
    assert.equal(healthAutoExportTokenMatches(token, digest), true);
    assert.equal(healthAutoExportTokenMatches("other-token", digest), false);
    assert.equal(healthAutoExportTokenMatches(token, "abcd"), false);
  });
});

describe("health auto export ingest", { concurrency: false }, () => {
  const previous = {
    databaseUrl: process.env.DATABASE_URL,
    password: process.env.AUTH_PASSWORD_HASH,
    totp: process.env.AUTH_TOTP_SECRET,
    session: process.env.AUTH_SESSION_SECRET,
    sync: process.env.RESONANCE_SYNC_SECRET,
    fitness: process.env.FITNESS_INGEST_TOKEN,
  };
  let session = "";
  let token = "";

  before(async () => {
    process.env.AUTH_PASSWORD_HASH = await hash("floor-secret");
  });

  after(() => {
    for (const [key, value] of Object.entries({
      DATABASE_URL: previous.databaseUrl,
      AUTH_PASSWORD_HASH: previous.password,
      AUTH_TOTP_SECRET: previous.totp,
      AUTH_SESSION_SECRET: previous.session,
      RESONANCE_SYNC_SECRET: previous.sync,
      FITNESS_INGEST_TOKEN: previous.fitness,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    setSqlClientForTests(null);
    resetFitnessStoreForTests();
  });

  beforeEach(async () => {
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    process.env.AUTH_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
    process.env.AUTH_SESSION_SECRET = "session-secret-for-tests";
    process.env.RESONANCE_SYNC_SECRET = "hub-secret";
    process.env.FITNESS_INGEST_TOKEN = "shortcut-token";
    resetFitnessStoreForTests();
    setSqlClientForTests(memorySql());
    await migrate();
    session = await createSession("Mozilla/5.0 (iPhone) Safari/17.0");
    token = "";
  });

  function rotate(headers: Record<string, string> = {}) {
    return rotateToken(
      new Request(TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
          host: "resonance3.vercel.app",
          origin: "https://resonance3.vercel.app",
          "sec-fetch-site": "same-origin",
          cookie: `${SESSION_COOKIE}=${session}`,
          ...headers,
        },
      }),
    );
  }

  it("rejects a missing token, the wrong token, and the hub secret", async () => {
    const closed = await postIngest(aggregatedSteps, "anything");
    assert.equal(closed.status, 503);

    await saveHealthAutoExportTokenHash(hashHealthAutoExportToken("correct-token"));
    const missing = await postIngest(aggregatedSteps, null);
    assert.equal(missing.status, 401);
    const wrong = await postIngest(aggregatedSteps, "nope");
    assert.equal(wrong.status, 401);
    const hub = await postIngest(aggregatedSteps, "hub-secret");
    assert.equal(hub.status, 401);
    const bearer = await postIngest(aggregatedSteps, null, { authorization: "Bearer correct-token" });
    assert.equal(bearer.status, 401);
    const shortcut = await postIngest(aggregatedSteps, null, { "x-fitness-token": "shortcut-token" });
    assert.equal(shortcut.status, 401);
    const empty = await postIngest({ data: { metrics: [], workouts: [] } }, "correct-token");
    assert.equal(empty.status, 400);
    const rows = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM fitness_metrics WHERE source = 'health-auto-export'`,
    );
    assert.equal(Number(rows[0]?.n), 0);
  });

  it("upserts the same payload twice and replaces an overlapping range", async () => {
    token = "correct-token";
    await saveHealthAutoExportTokenHash(hashHealthAutoExportToken(token));
    const first = await postIngest({ data: { ...aggregatedSteps.data, ...nrcWorkout.data } }, token);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { ok: true, steps: 2, workouts: 1 });
    const second = await postIngest({ data: { ...aggregatedSteps.data, ...nrcWorkout.data } }, token);
    assert.equal(second.status, 200);
    const stepCount = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM fitness_metrics WHERE source = 'health-auto-export'`,
    );
    const workoutCount = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM fitness_workouts WHERE source = 'health-auto-export'`,
    );
    assert.equal(Number(stepCount[0]?.n), 2);
    assert.equal(Number(workoutCount[0]?.n), 1);

    const overlap = await postIngest(
      {
        data: {
          metrics: [
            {
              name: "step_count",
              units: "count",
              data: [
                { qty: 9100, date: "2026-09-02 00:00:00 -0500" },
                { qty: 1000, date: "2026-09-03 00:00:00 -0500" },
              ],
            },
          ],
          workouts: [
            {
              id: "nrc-2026-09-12",
              name: "Running",
              start: "2026-09-12 06:40:00 -0500",
              end: "2026-09-12 07:22:00 -0500",
              duration: 2500,
              source: "Nike Run Club",
              distance: { qty: 3.4, units: "mi" },
            },
          ],
        },
      },
      token,
    );
    assert.equal(overlap.status, 200);
    const days = await sqlQuery<{ day: string | Date; qty: string }>(
      `SELECT day, qty::text AS qty
       FROM fitness_metrics WHERE source = 'health-auto-export' ORDER BY day`,
    );
    const dayKey = (value: string | Date) =>
      value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
    assert.deepEqual(
      days.map((row) => [dayKey(row.day), Number(row.qty)]),
      [
        ["2026-09-01", 8421],
        ["2026-09-02", 9100],
        ["2026-09-03", 1000],
      ],
    );
    const runs = await sqlQuery<{ n: string; qty: string }>(
      `SELECT count(*)::text AS n, distance_qty::text AS qty
       FROM fitness_workouts WHERE external_id = 'nrc-2026-09-12'
       GROUP BY distance_qty`,
    );
    assert.equal(runs.length, 1);
    assert.equal(Number(runs[0]?.n), 1);
    assert.equal(Number(runs[0]?.qty) > 3, true);
  });

  it("writes a history longer than one database batch and feeds Steps and Runs", async () => {
    token = "history-token";
    await saveHealthAutoExportTokenHash(hashHealthAutoExportToken(token));
    const count = HEALTH_AUTO_EXPORT_DB_BATCH + 5;
    const data = Array.from({ length: count }, (_, index) => {
      const day = new Date(Date.UTC(2020, 0, 1 + index)).toISOString().slice(0, 10);
      return { qty: 1000 + index, date: `${day} 12:00:00 -0600`, source: "Apple Watch" };
    });
    const response = await postIngest(
      { data: { metrics: [{ name: "step_count", units: "count", data }] } },
      token,
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { steps: number };
    assert.equal(body.steps, count);
    const stored = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM fitness_metrics WHERE source = 'health-auto-export'`,
    );
    assert.equal(Number(stored[0]?.n), count);
    const steps = await loadFitnessNode("steps", "2024-01-28");
    assert.match(steps.detail?.headline ?? "", /\d/);
    assert.equal(steps.detail?.rows.some((row) => row.primary.includes("steps")), true);

    await postIngest(nrcWorkout, token);
    const runs = await loadFitnessNode("runs", "2026-09-12");
    assert.match(runs.detail?.rows.map((row) => row.primary).join(" ") ?? "", /mi/);
    assert.match(runs.detail?.rows.map((row) => row.secondary ?? "").join(" ") ?? "", /km/);
    assert.match(runs.detail?.rows.map((row) => row.secondary ?? "").join(" ") ?? "", /Nike Run Club/);
  });

  it("refuses a body over the 4.5 MB cap and does not write", async () => {
    await saveHealthAutoExportTokenHash(hashHealthAutoExportToken("sized-token"));
    const tooBig = await postIngest("{}", "sized-token", {
      "content-length": String(HEALTH_AUTO_EXPORT_BODY_LIMIT + 1),
    });
    assert.equal(tooBig.status, 413);
    const raw = `{"pad":"${"a".repeat(HEALTH_AUTO_EXPORT_BODY_LIMIT)}"}`;
    const overflow = await postIngest(raw, "sized-token");
    assert.equal(overflow.status, 413);
    const rows = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM fitness_metrics WHERE source = 'health-auto-export'`,
    );
    assert.equal(Number(rows[0]?.n), 0);
  });

  it("shows the token once, stores only the hash, and keeps heart rate off the public view", async () => {
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
      const created = await rotate();
      assert.equal(created.status, 200);
      assert.equal(created.headers.get("cache-control"), "no-store");
      const createdBody = (await created.json()) as { token?: string };
      token = createdBody.token ?? "";
      assert.equal(token.length > 20, true);
      const stored = await sqlQuery<{ token_hash: string }>(
        `SELECT token_hash FROM health_auto_export_tokens WHERE id = 1`,
      );
      assert.equal(stored[0]?.token_hash, createHash("sha256").update(token).digest("hex"));
      assert.equal(stored[0]?.token_hash.includes(token), false);
      assert.equal(JSON.stringify(logs).includes(token), false);

      const posted = await postIngest({ data: { ...aggregatedSteps.data, workouts: nrcWorkout.data.workouts } }, token);
      assert.equal(posted.status, 200);
      const postedBody = JSON.stringify(await posted.json());
      assert.equal(postedBody.includes("154"), false);
      assert.equal(postedBody.includes("41.881"), false);

      const bundle = await loadFitnessBundle("2026-09-12");
      const story = buildFitnessStory({
        metrics: bundle.metrics,
        workouts: bundle.workouts,
        manuals: [],
        today: "2026-09-12",
        publicMode: true,
      });
      const privateRuns = await loadFitnessNode("runs", "2026-09-12");
      assert.ok(privateRuns.detail);
      const publicRuns = publicFitnessDetail(privateRuns.detail);
      const [{ FitnessStoryView }, { FitnessDetail }] = await Promise.all([
        import("@/components/fitness-story"),
        import("@/components/fitness-detail"),
      ]);
      const html = render(
        createElement(
          "div",
          null,
          createElement(FitnessStoryView, { story, stepsRange: "w", runsRange: "w" }),
          createElement(FitnessDetail, { detail: publicRuns }),
        ),
      );
      assert.equal(html.includes("bpm"), false);
      assert.equal(html.includes("154"), false);
      assert.equal(html.includes("41.881"), false);
      assert.equal(html.includes("heartRate"), false);
      assert.match(html, /steps|Steps|mi/);
      const face = fitnessHomeFace({
        value: "8,421",
        unit: "steps",
        lines: ["61 bpm resting", "8,421 steps this week"],
        publicMode: true,
      });
      assert.equal(`${face.headline} ${face.status}`.includes("bpm"), false);

      const opened = await getRuns(
        new Request("https://resonance3.vercel.app/api/fitness/runs", {
          headers: {
            cookie: `${SESSION_COOKIE}=${session}; ${PUBLIC_MODE_COOKIE}=1`,
          },
        }),
      );
      const runsBody = JSON.stringify(await opened.json());
      assert.equal(runsBody.includes("bpm"), false);
      assert.equal(runsBody.includes("154"), false);

      const hidden = await rotate({ cookie: `${SESSION_COOKIE}=${session}; ${PUBLIC_MODE_COOKIE}=1` });
      assert.equal(hidden.status, 404);
      assert.equal((await hidden.text()).includes(token), false);
      const machine = await rotate({ authorization: "Bearer hub-secret", cookie: "" });
      assert.equal(machine.status, 401);
    } finally {
      for (const key of Object.keys(originals) as (keyof typeof originals)[]) {
        console[key] = originals[key];
      }
    }
  });
});

describe("health auto export settings copy", () => {
  it("documents the app settings and does not ship a token", async () => {
    const { HealthAutoExportGuide } = await import("@/components/health-auto-export-guide");
    const html = render(createElement(HealthAutoExportGuide));
    assert.match(html, new RegExp(HEALTH_AUTO_EXPORT_URL.replace(/[.]/g, "\\.")));
    assert.match(html, /JSON/);
    assert.match(html, /Export version2/);
    assert.match(html, new RegExp(HEALTH_AUTO_EXPORT_HEADER_NAME));
    assert.match(html, /step_count/);
    assert.match(html, /Aggregate data on/);
    assert.match(html, /Batch Requests/);
    assert.match(html, /4\.5 MB/);
    assert.match(html, /full history/);
    assert.match(html, /earliest day in Apple Health/);
    assert.equal(html.includes("bpm"), false);
    const client = readFileSync(path.join(root, "src/components/health-auto-export-token.tsx"), "utf8");
    assert.match(client, /Generate \/ rotate Health Auto Export token/);
    assert.match(client, /useState<string \| null>\(null\)/);
    assert.equal(client.includes("token_hash"), false);
    assert.equal(client.includes("FITNESS_INGEST_TOKEN"), false);
    assert.equal(client.includes("AUTH_"), false);
    const file = readFileSync(path.join(root, "db/migrations/043_health_auto_export_token.sql"), "utf8");
    const embedded = EMBEDDED_MIGRATIONS.find((entry) => entry.id === "043_health_auto_export_token");
    assert.equal(embedded?.sql, file);
    assert.equal(EMBEDDED_MIGRATIONS.some((entry) => entry.id === "042_visitor_counts"), true);
    assert.equal(file.includes("INSERT"), false);
    assert.match(file, /042 is reserved/);
  });
});
