import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { POST } from "@/app/api/fitness/run/route";
import { planAccess, SESSION_COOKIE } from "@/lib/auth-core";
import { createSession } from "@/lib/auth-store";
import { fitnessCards, workoutSamples } from "@/lib/fitness-board";
import { NRC_SOURCE, RESONANCE_RUN_SOURCE, nrcRunsAsWrites, resonanceNrcRun } from "@/lib/fitness-nrc";
import { loadFitnessNode, readNrcRuns, resetFitnessStoreForTests, upsertFitnessRows } from "@/lib/fitness-store";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { migrate } from "@/lib/pg/migrate";
import { isHiddenInPublicMode, PUBLIC_MODE_COOKIE } from "@/lib/public-mode";
import {
  EARTH_RADIUS_M,
  EMPTY_TRACK,
  FIX_ACCURACY_MAX_M,
  FIX_SPEED_MAX_M_S,
  GEO_WATCH_OPTIONS,
  LOCATION_DENIED,
  METERS_PER_MILE,
  RUN_TRACK_NOTE,
  appendFix,
  averagePaceSecPerMile,
  currentPaceSecPerMile,
  elapsedOf,
  elapsedSeconds,
  formatElapsed,
  formatMinPerMile,
  freezeDraft,
  haversineMeters,
  parseDraft,
  parseRunSave,
  pauseRun,
  replayTrack,
  resumeDraft,
  resumeRun,
  segmentAllowed,
  startRun,
  stopRun,
  type GeoFix,
  type TrackState,
} from "@/lib/run-track";

const CHICAGO = { lat: 41.8781, lng: -87.6298 };

function north(lat: number, meters: number): number {
  return lat + (meters / EARTH_RADIUS_M) * (180 / Math.PI);
}

function fix(lat: number, timeMs: number, accuracyM: number | null = 5, lng = CHICAGO.lng): GeoFix {
  return { lat, lng, accuracyM, timeMs };
}

function track(points: GeoFix[]): TrackState {
  return points.reduce<TrackState>((state, point, index) => appendFix(state, point, { anchor: index === 0 }), EMPTY_TRACK);
}

describe("run distance and pace", () => {
  it("sums haversine miles and drops a poor fix or a jump faster than 7 m/s", () => {
    const slow = haversineMeters(CHICAGO, { lat: north(CHICAGO.lat, 20), lng: CHICAGO.lng });
    assert.ok(Math.abs(slow - 20) < 0.05);
    assert.equal(segmentAllowed(70, 10), true);
    assert.equal(segmentAllowed(70, 10) && 70 / 10 === FIX_SPEED_MAX_M_S, true);
    assert.equal(segmentAllowed(70.1, 10), false);
    assert.equal(segmentAllowed(20, 0), false);
    assert.equal(segmentAllowed(20, -1), false);

    const accepted = track([
      fix(CHICAGO.lat, 0, FIX_ACCURACY_MAX_M),
      fix(north(CHICAGO.lat, 20), 10_000),
      fix(north(CHICAGO.lat, 40), 20_000),
    ]);
    assert.equal(accepted.points.length, 3);
    assert.ok(Math.abs(accepted.distanceM - 40) < 0.2);

    const fuzzy = appendFix(accepted, fix(north(CHICAGO.lat, 50), 30_000, FIX_ACCURACY_MAX_M + 0.1));
    assert.equal(fuzzy, accepted);
    const missing = appendFix(accepted, fix(north(CHICAGO.lat, 50), 30_000, null));
    assert.equal(missing, accepted);
    const fast = appendFix(accepted, fix(north(CHICAGO.lat, 40 + 1000), 21_000));
    assert.equal(fast, accepted);

    const afterDrop = appendFix(fast, fix(north(CHICAGO.lat, 55), 30_000));
    assert.equal(afterDrop.points.length, 4);
    assert.equal(afterDrop.points[2]?.lat, accepted.points[2]?.lat);
    const added = haversineMeters(
      { lat: accepted.points[2]!.lat, lng: CHICAGO.lng },
      { lat: afterDrop.points[3]!.lat, lng: CHICAGO.lng },
    );
    assert.ok(Math.abs(afterDrop.distanceM - (accepted.distanceM + added)) < 0.001);
  });

  it("does not add distance across a pause anchor", () => {
    const moved = track([fix(CHICAGO.lat, 0), fix(north(CHICAGO.lat, 30), 10_000)]);
    const anchored = appendFix(moved, fix(north(CHICAGO.lat, 200), 60_000), { anchor: true });
    assert.equal(anchored.distanceM, moved.distanceM);
    assert.equal(anchored.points.at(-1)?.anchor, true);
    const continued = appendFix(anchored, fix(north(CHICAGO.lat, 210), 70_000));
    const leg = haversineMeters(
      { lat: anchored.points.at(-1)!.lat, lng: CHICAGO.lng },
      { lat: continued.points.at(-1)!.lat, lng: CHICAGO.lng },
    );
    assert.ok(Math.abs(continued.distanceM - (moved.distanceM + leg)) < 0.001);
    const replayed = replayTrack(continued.points);
    assert.ok(Math.abs(replayed.distanceM - continued.distanceM) < 0.001);
    const pace = currentPaceSecPerMile(continued.points);
    const expected = 10 / (leg / METERS_PER_MILE);
    assert.ok(pace !== null && Math.abs(pace - expected) < 0.01);
  });

  it("formats average pace from elapsed time and leaves an empty distance blank", () => {
    const sec = averagePaceSecPerMile(METERS_PER_MILE, 600_000);
    assert.equal(sec, 600);
    assert.equal(formatMinPerMile(sec), "10:00");
    assert.equal(averagePaceSecPerMile(0, 600_000), null);
    assert.equal(averagePaceSecPerMile(METERS_PER_MILE, 0), null);
    assert.equal(formatMinPerMile(null), null);
    assert.equal(currentPaceSecPerMile([]), null);
    assert.equal(currentPaceSecPerMile([{ lat: 1, lng: 2, timeMs: 0, anchor: true }]), null);
    assert.equal(elapsedSeconds(26_600), 26);
    assert.equal(formatElapsed(26_600), "0:26");
    assert.equal(formatElapsed(65_000), "1:05");
    assert.equal(formatElapsed(3_661_000), "1:01:01");
  });

  it("keeps paused time and a crash gap out of the clock", () => {
    const started = startRun(1_000, "2026-10-12T15:00:00.000Z");
    const paused = pauseRun(started, 11_000);
    assert.equal(paused.phase, "paused");
    assert.equal(elapsedOf(paused, 50_000), 10_000);
    const resumed = resumeRun(paused, 50_000);
    assert.equal(elapsedOf(resumed, 52_000), 12_000);
    const stopped = stopRun(resumed, 53_000);
    assert.equal(stopped.phase, "stopped");
    assert.equal(elapsedOf(stopped, 90_000), 13_000);

    const frozen = freezeDraft(started, 11_000);
    const restored = resumeDraft(frozen, 80_000);
    assert.equal(restored.elapsedMs, 10_000);
    assert.equal(elapsedOf(restored, 81_000), 11_000);
    const raw = JSON.stringify(frozen);
    const parsed = parseDraft(raw);
    assert.equal(parsed?.elapsedMs, 10_000);
    assert.equal(parseDraft("nope"), null);
    assert.equal(parseDraft(JSON.stringify({ ...frozen, track: { points: [], distanceM: 5 } })), null);
  });

  it("watches high accuracy and tells the truth about the phone", () => {
    assert.equal(GEO_WATCH_OPTIONS.enableHighAccuracy, true);
    assert.match(RUN_TRACK_NOTE, /iOS stops GPS/);
    assert.match(RUN_TRACK_NOTE, /Distance is approximate/);
    assert.match(LOCATION_DENIED, /Location is off/);
    const page = readFileSync(new URL("../app/n/fitness/run/page.tsx", import.meta.url), "utf8");
    const route = readFileSync(new URL("../app/api/fitness/run/route.ts", import.meta.url), "utf8");
    const tracker = readFileSync(new URL("../components/run-tracker.tsx", import.meta.url), "utf8");
    const parent = readFileSync(new URL("../app/n/[parent]/page.tsx", import.meta.url), "utf8");
    const body = page.slice(page.indexOf("export default"));
    assert.ok(body.indexOf('requireRole("owner")') < body.indexOf("isPublicMode"));
    assert.ok(body.indexOf("isPublicMode") < body.indexOf("notFound"));
    assert.ok(body.indexOf("notFound") < body.indexOf("<RunTracker"));
    assert.match(page, /href="\/n\/fitness"/);
    assert.match(route, /isSameOriginRequest/);
    assert.match(route, /requireRole\("owner", request\)/);
    assert.match(route, /privateModeResponse/);
    assert.match(route, /upsertFitnessRows/);
    assert.match(tracker, /GEO_WATCH_OPTIONS/);
    assert.match(tracker, /wakeLock/);
    assert.match(tracker, /visibilitychange/);
    assert.match(tracker, /localStorage/);
    assert.match(tracker, /LOCATION_DENIED/);
    assert.match(parent, /startRun=\{!publicMode\}/);
    const grid = readFileSync(new URL("../components/fitness-grid.tsx", import.meta.url), "utf8");
    assert.match(grid, /href="\/n\/fitness\/run"/);
    assert.match(grid, /Start Run/);
    assert.match(grid, /GPS on this phone/);
    assert.match(grid, /startRun \? \(/);
    assert.equal(isHiddenInPublicMode("/n/fitness/run"), true);
    assert.equal(isHiddenInPublicMode("/n/fitness/runs"), false);
    assert.equal(isHiddenInPublicMode("/api/fitness/run"), true);
    assert.equal(isHiddenInPublicMode("/api/fitness/runs"), false);
    assert.deepEqual(
      planAccess({
        pathname: "/n/fitness/run",
        method: "GET",
        sessionToken: null,
        bearerOk: false,
        loginConfigured: true,
        nextPath: "/n/fitness/run",
      }),
      { kind: "redirect", next: "/n/fitness/run" },
    );
  });

  it("builds a resonance run with no heart rate and a Runs bar", () => {
    const built = resonanceNrcRun({
      startedAt: "2026-10-12T15:00:00.000Z",
      durationSec: 1800,
      distanceM: 3 * METERS_PER_MILE,
    });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.equal(built.run.avgHr, null);
    assert.equal(built.run.source, RESONANCE_RUN_SOURCE);
    assert.equal(built.run.day, "2026-10-12");
    assert.equal(built.run.distanceMi, "3");
    assert.equal(resonanceNrcRun({ startedAt: "2026-10-12T15:00:00.000Z", durationSec: 100, distanceM: 10 }).ok, false);
    const samples = workoutSamples(nrcRunsAsWrites([built.run]));
    const card = fitnessCards([], samples, "2026-10-12").find((item) => item.id === "runs");
    assert.equal(card?.bars?.length, 1);
    assert.ok(Math.abs((card?.bars?.[0]?.miles ?? 0) - 3) < 0.001);
    assert.equal(samples[0]?.sourceLabel, RESONANCE_RUN_SOURCE);
    assert.equal(samples[0]?.heartRateAvg, null);
    const shortcut = workoutSamples(
      nrcRunsAsWrites([
        {
          day: "2026-10-11",
          startTime: "2026-10-11T12:00:00.000Z",
          distanceMi: "2",
          durationSec: "1200",
          paceSecPerMi: "600",
          avgHr: "140",
          startKey: "2026-10-11|2026-10-11T12:00:00.000Z",
          measureKey: "2026-10-11|2.00|1200",
        },
      ]),
    );
    assert.equal(shortcut[0]?.sourceLabel, NRC_SOURCE);
  });
});

function envSnapshot() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_PASSWORD_HASH: process.env.AUTH_PASSWORD_HASH,
    AUTH_TOTP_SECRET: process.env.AUTH_TOTP_SECRET,
    AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
    FITNESS_LOCAL_FILE: process.env.FITNESS_LOCAL_FILE,
  };
}

function restore(previous: ReturnType<typeof envSnapshot>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function postgres(): Promise<SqlClient> {
  const db = new PGlite();
  return {
    async query<T extends Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
      const result = await db.query<T>(text, [...params]);
      return result.rows ?? [];
    },
  };
}

describe("start run save", { concurrency: false }, () => {
  const previous = envSnapshot();
  let token = "";

  before(async () => {
    process.env.DATABASE_URL = "postgres://resonance@127.0.0.1:5432/resonance";
    process.env.AUTH_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$dummy";
    process.env.AUTH_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
    process.env.AUTH_SESSION_SECRET = "session-secret-for-run-tests";
    delete process.env.FITNESS_LOCAL_FILE;
    setSqlClientForTests(await postgres());
    resetFitnessStoreForTests();
    await migrate();
    token = await createSession("run-tracker-test");
  });

  after(() => {
    setSqlClientForTests(null);
    resetFitnessStoreForTests();
    restore(previous);
  });

  function post(body: unknown, headers: Record<string, string> = {}) {
    return POST(
      new Request("https://resonance3.vercel.app/api/fitness/run", {
        method: "POST",
        headers: {
          host: "resonance3.vercel.app",
          origin: "https://resonance3.vercel.app",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=${token}`,
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    );
  }

  const runBody = {
    startedAt: "2026-10-12T15:00:00.000Z",
    durationSec: 1800,
    distanceM: 3 * METERS_PER_MILE,
  };

  it("rejects a signed-out, cross-site, or public-mode save", async () => {
    assert.equal(parseRunSave(null).ok, false);
    assert.equal(parseRunSave({ startedAt: "nope", durationSec: 10, distanceM: 100 }).ok, false);
    const signedOut = await post(runBody, { cookie: "" });
    assert.equal(signedOut.status, 401);
    const bearer = await post(runBody, { authorization: "Bearer hub" });
    assert.equal(bearer.status, 401);
    const cross = await post(runBody, { "sec-fetch-site": "cross-site" });
    assert.equal(cross.status, 403);
    const short = await post({ ...runBody, distanceM: 10 });
    assert.equal(short.status, 400);
    const hidden = await post(runBody, { cookie: `${SESSION_COOKIE}=${token}; ${PUBLIC_MODE_COOKIE}=1` });
    assert.equal(hidden.status, 404);
  });

  it("stores one resonance run with no heart rate and shows it on Runs", async () => {
    const first = await post(runBody);
    assert.equal(first.status, 200);
    const saved = (await first.json()) as { ok: boolean; source: string; avgHr: null; distanceMi: string };
    assert.equal(saved.ok, true);
    assert.equal(saved.source, RESONANCE_RUN_SOURCE);
    assert.equal(saved.avgHr, null);
    assert.equal(saved.distanceMi, "3");

    const again = await post(runBody);
    assert.equal(again.status, 200);
    const longer = await post({ ...runBody, durationSec: 1900, distanceM: 3.2 * METERS_PER_MILE });
    assert.equal(longer.status, 200);

    const rows = await sqlQuery<{ n: string; hr: string | null; source: string; miles: string }>(
      `SELECT count(*)::text AS n, max(avg_hr)::text AS hr, max(payload->>'source') AS source,
              max(distance_mi)::text AS miles
       FROM fitness_nrc_runs
       WHERE payload->>'source' = 'resonance'`,
    );
    assert.equal(rows[0]?.n, "1");
    assert.equal(rows[0]?.hr, null);
    assert.equal(rows[0]?.source, RESONANCE_RUN_SOURCE);
    assert.equal(Number(rows[0]?.miles), 3.2);

    await upsertFitnessRows({
      metrics: [],
      workouts: [],
      nrcRuns: [
        {
          day: "2026-10-11",
          startTime: "2026-10-11T12:00:00.000Z",
          distanceMi: "2",
          durationSec: "1200",
          paceSecPerMi: "600",
          avgHr: "151",
          startKey: "2026-10-11|2026-10-11T12:00:00.000Z",
          measureKey: "2026-10-11|2.00|1200",
        },
      ],
    });
    const club = await sqlQuery<{ source: string; hr: string }>(
      `SELECT payload->>'source' AS source, avg_hr::text AS hr
       FROM fitness_nrc_runs WHERE day = '2026-10-11'`,
    );
    assert.equal(club[0]?.source, NRC_SOURCE);
    assert.equal(Number(club[0]?.hr), 151);

    const stored = await readNrcRuns();
    const phone = stored.find((row) => row.source === RESONANCE_RUN_SOURCE);
    assert.equal(phone?.avgHr, null);
    const loaded = await loadFitnessNode("runs", "2026-10-12");
    const bar = loaded.detail?.bars?.find((item) => Math.abs(item.miles - 3.2) < 0.05);
    assert.ok(bar);
    const line = loaded.detail?.rows.find((row) => row.secondary?.includes(RESONANCE_RUN_SOURCE));
    assert.ok(line);
    assert.equal(line?.secondary?.includes("bpm"), false);
  });
});
