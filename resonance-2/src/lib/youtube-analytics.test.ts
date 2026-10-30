import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";
import { GET as cronGet } from "@/app/api/cron/youtube/route";
import { GET as yesterdayGet } from "@/app/api/youtube/yesterday/route";
import { GET as startGet } from "@/app/api/youtube/oauth/start/route";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS, YOUTUBE_ANALYTICS_SQL } from "@/lib/pg/embedded-migrations";
import { migrate } from "@/lib/pg/migrate";
import { rememberHealthMark } from "@/lib/health-mark";
import {
  CRON_GATE_PLAN,
  SKIPPED_HEALTH_CHECK,
  YOUTUBE_CRON_JOBS,
  YOUTUBE_OAUTH_REDIRECT,
  YOUTUBE_SCOPES,
  decideYouTubePull,
  healthMarkPasses,
  isHobbyDailySchedule,
  presentYouTubeScreen,
  pullFollowsHealthCheck,
  trendWindow,
  youtubeSlotForSchedule,
  type YouTubeAnalyticsModel,
} from "@/lib/youtube-analytics";
import {
  loadYesterdayNumbers,
  loadYouTubeAnalytics,
  saveYouTubeConnection,
} from "@/lib/youtube-analytics-store";
import { setYouTubeFetchForTests } from "@/lib/youtube-google";
import { openYouTubeState, sealYouTubeState, youtubeAuthUrl } from "@/lib/youtube-oauth";
import { runScheduledYouTubePull } from "@/lib/youtube-pull";
import { BACKUP_CRON_SCHEDULE } from "@/lib/backup";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REFRESH = "refresh-secret-value";
const NOW = new Date("2026-10-30T18:00:00.000Z");

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

function model(partial: Partial<YouTubeAnalyticsModel> = {}): YouTubeAnalyticsModel {
  const window = trendWindow(NOW);
  return {
    connected: true,
    channelTitle: "Resonance",
    subscribers: 1240,
    videoCount: 3,
    lastStatus: "ok",
    lastMessage: "ok",
    days: [
      { day: window.end, views: 80, watchMinutes: 40, avgSeconds: 30 },
      { day: window.start, views: 20, watchMinutes: 10, avgSeconds: 30 },
    ],
    videos: [
      {
        videoId: "abcdefghijk",
        title: "Launch",
        views: 80,
        watchMinutes: 40,
        avgPercent: 55.5,
        impressions: 1000,
        ctr: 4.2,
        likes: 12,
        comments: 3,
      },
    ],
    windowStart: window.start,
    windowEnd: window.end,
    ...partial,
  };
}

describe("YouTube analytics", { concurrency: false }, () => {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    GOOGLE_YT_CLIENT_ID: process.env.GOOGLE_YT_CLIENT_ID,
    GOOGLE_YT_CLIENT_SECRET: process.env.GOOGLE_YT_CLIENT_SECRET,
    RESONANCE_SYNC_SECRET: process.env.RESONANCE_SYNC_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
  };

  after(() => {
    setSqlClientForTests(null);
    setYouTubeFetchForTests(null);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("keeps migration 045 and schedules one Hobby-safe job per health check", () => {
    const file = readFileSync(path.join(root, "db/migrations/045_youtube_analytics.sql"), "utf8");
    assert.equal(YOUTUBE_ANALYTICS_SQL, file);
    assert.equal(EMBEDDED_MIGRATIONS.at(-1)?.id, "045_youtube_analytics");
    assert.equal(file.includes("refresh_token"), true);
    assert.equal(/^\s*INSERT\b/im.test(file), false);
    const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")) as {
      crons: { path: string; schedule: string }[];
    };
    assert.deepEqual(
      vercel.crons.map((cron) => `${cron.path} ${cron.schedule}`),
      CRON_GATE_PLAN.map((cron) => `${cron.path} ${cron.schedule}`),
    );
    assert.deepEqual(vercel.crons[0], { path: "/api/cron/backup", schedule: BACKUP_CRON_SCHEDULE });
    assert.equal(CRON_GATE_PLAN[0]?.gated, false);
    const healthHoursCt = [9, 13, 18];
    YOUTUBE_CRON_JOBS.forEach((job, index) => {
      assert.equal(isHobbyDailySchedule(job.schedule), true, job.schedule);
      assert.equal(CRON_GATE_PLAN.some((row) => row.schedule === job.schedule && row.gated), true);
      assert.equal(pullFollowsHealthCheck(job.schedule, healthHoursCt[index]!), true, job.schedule);
    });
    assert.equal(pullFollowsHealthCheck("0 15 * * *", 9), false);
    assert.equal(pullFollowsHealthCheck("0 19 * * *", 13), false);
    assert.equal(pullFollowsHealthCheck("0 0 * * *", 18), false);
    assert.equal(youtubeSlotForSchedule("0 16 * * *"), "after-9am-ct");
    assert.equal(youtubeSlotForSchedule("0 20 * * *"), "after-1pm-ct");
    assert.equal(youtubeSlotForSchedule("0 1 * * *"), "after-6pm-ct");
    const sources = [
      "src/lib/youtube-pull.ts",
      "src/lib/youtube-google.ts",
      "src/lib/youtube-analytics-store.ts",
      "src/app/api/youtube/oauth/callback/route.ts",
      "src/app/api/cron/youtube/route.ts",
    ];
    for (const name of sources) {
      const source = readFileSync(path.join(root, name), "utf8");
      assert.equal(/console\.(log|info|error|warn)\([^)]*refresh/i.test(source), false, name);
      assert.equal(source.includes(REFRESH), false, name);
    }
  });

  it("runs only when the latest health check passed", () => {
    assert.deepEqual(decideYouTubePull({ healthPasses: true }), { run: true, message: null });
    assert.deepEqual(decideYouTubePull({ healthPasses: false }), {
      run: false,
      message: SKIPPED_HEALTH_CHECK,
    });
    assert.equal(SKIPPED_HEALTH_CHECK, "skipped: health check not passing");
    assert.equal(healthMarkPasses({ ok: true, checkedAt: "2026-10-30T16:00:00.000Z" }, NOW), true);
    assert.equal(healthMarkPasses({ ok: false, checkedAt: "2026-10-30T17:30:00.000Z" }, NOW), false);
    assert.equal(healthMarkPasses({ ok: true, checkedAt: "2026-10-30T10:00:00.000Z" }, NOW), false);
    assert.equal(healthMarkPasses(null, NOW), false);
    const window = trendWindow(NOW);
    assert.equal(window.yesterday, "2026-10-29");
    assert.equal(window.end, "2026-10-29");
    assert.equal(window.start, "2026-10-02");
  });

  it("hides analytics in Public view and keeps the refresh token off the screen", () => {
    const shared = presentYouTubeScreen(model(), { publicMode: true, connectReady: true, denied: false });
    assert.equal(shared, null);
    const screen = presentYouTubeScreen(model(), { publicMode: false, connectReady: true, denied: false });
    assert.ok(screen);
    assert.equal(screen.totals.find((row) => row.id === "subscribers")?.headline, "1,240");
    assert.equal(screen.totals.find((row) => row.id === "views")?.headline, "100");
    assert.equal(screen.videos[0]?.ctr, "4.2%");
    assert.equal(screen.videos[0]?.impressions, "1,000");
    assert.equal(screen.trend.length, 28);
    assert.equal(screen.connectLabel, "Reconnect channel");
    const text = JSON.stringify(screen);
    assert.equal(text.includes(REFRESH), false);
    assert.equal(text.includes("GOOGLE_YT"), false);
    const skipped = presentYouTubeScreen(
      model({ lastStatus: "skipped", lastMessage: SKIPPED_HEALTH_CHECK, connected: false }),
      {
        publicMode: false,
        connectReady: false,
        denied: false,
      },
    );
    assert.equal(skipped?.skipMessage, SKIPPED_HEALTH_CHECK);
    assert.equal(skipped?.homeChannelLine, `Channel · ${SKIPPED_HEALTH_CHECK}`);
    assert.equal(skipped?.connectHref, null);
  });

  it("builds the Google consent URL with the read-only scopes and the production redirect", () => {
    const secret = "session-secret-for-youtube-state";
    const state = sealYouTubeState(secret, NOW.getTime());
    assert.equal(openYouTubeState(state, secret, NOW.getTime()), true);
    assert.equal(openYouTubeState(state, secret, NOW.getTime() + 11 * 60 * 1000), false);
    assert.equal(openYouTubeState(state, "other-secret", NOW.getTime()), false);
    const url = new URL(youtubeAuthUrl({ clientId: "client-id.apps.googleusercontent.com", state }));
    assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(url.searchParams.get("redirect_uri"), YOUTUBE_OAUTH_REDIRECT);
    assert.equal(url.searchParams.get("access_type"), "offline");
    assert.equal(url.searchParams.get("prompt"), "consent");
    assert.deepEqual(url.searchParams.get("scope")?.split(" "), [...YOUTUBE_SCOPES]);
    assert.equal(url.searchParams.get("client_secret"), null);
    assert.equal(url.toString().includes("client-secret"), false);
  });

  it("pulls after a passing health check and keeps the refresh token off yesterday", async () => {
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    process.env.GOOGLE_YT_CLIENT_ID = "client-id";
    process.env.GOOGLE_YT_CLIENT_SECRET = "client-secret";
    process.env.RESONANCE_SYNC_SECRET = "hub-secret";
    process.env.CRON_SECRET = "cron-secret";
    setSqlClientForTests(memorySql());
    await migrate();
    await saveYouTubeConnection({
      refreshToken: REFRESH,
      channelId: "UC123",
      channelTitle: "Resonance",
      subscribers: 1240,
      videoCount: 2,
    });
    await rememberHealthMark(true, "2026-10-30T17:00:00.000Z");

    let fetches = 0;
    setYouTubeFetchForTests(async (input, init) => {
      fetches += 1;
      const url = String(input);
      const raw = init?.body;
      const body = typeof raw === "string" ? raw : raw instanceof URLSearchParams ? raw.toString() : "";
      assert.equal(body.includes(REFRESH) || !url.includes("oauth2.googleapis.com"), true);
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "access-not-logged", expires_in: 3600 }), { status: 200 });
      }
      if (url.includes("/youtube/v3/channels")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "UC123",
                snippet: { title: "Resonance" },
                statistics: { subscriberCount: "1240", videoCount: "2", hiddenSubscriberCount: false },
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("youtubeanalytics.googleapis.com") && url.includes("dimensions=day")) {
        return new Response(
          JSON.stringify({
            columnHeaders: [
              { name: "day" },
              { name: "views" },
              { name: "estimatedMinutesWatched" },
              { name: "averageViewDuration" },
            ],
            rows: [
              ["2026-10-29", 80, 40, 30],
              ["2026-10-02", 20, 10, 15],
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("youtubeanalytics.googleapis.com") && url.includes("dimensions=video")) {
        const yesterday = url.includes("startDate=2026-10-29") && url.includes("endDate=2026-10-29");
        return new Response(
          JSON.stringify({
            columnHeaders: [
              { name: "video" },
              { name: "views" },
              { name: "estimatedMinutesWatched" },
              { name: "averageViewPercentage" },
              { name: "likes" },
              { name: "comments" },
              { name: "videoThumbnailImpressions" },
              { name: "videoThumbnailImpressionsClickRate" },
            ],
            rows: [["abcdefghijk", yesterday ? 15 : 80, yesterday ? 8 : 40, 55.5, 4, 1, 200, 4.2]],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/youtube/v3/videos")) {
        return new Response(
          JSON.stringify({ items: [{ id: "abcdefghijk", snippet: { title: "Launch" } }] }),
          { status: 200 },
        );
      }
      return new Response("no", { status: 404 });
    });

    const pulled = await runScheduledYouTubePull({ now: NOW, slot: "after-1pm-ct", log: () => {} });
    assert.equal(pulled.status, "ok");
    assert.ok(fetches >= 5);
    const loaded = await loadYouTubeAnalytics(NOW);
    const screen = presentYouTubeScreen(loaded, { publicMode: false, connectReady: true, denied: false });
    assert.equal(screen?.videos[0]?.title, "Launch");
    assert.equal(screen?.videos[0]?.ctr, "4.2%");
    assert.equal(JSON.stringify(loaded).includes(REFRESH), false);
    assert.equal(JSON.stringify(screen).includes(REFRESH), false);
    const yesterday = await loadYesterdayNumbers(NOW);
    assert.equal(yesterday.day, "2026-10-29");
    assert.equal(yesterday.channel?.views, 80);
    assert.equal(yesterday.channel?.subscribers, 1240);
    assert.equal(yesterday.videos[0]?.views, 15);
    assert.equal(yesterday.videos[0]?.impressions, 200);
    assert.equal(JSON.stringify(yesterday).includes(REFRESH), false);

    const denied = await yesterdayGet(new Request("https://resonance3.vercel.app/api/youtube/yesterday"));
    assert.equal(denied.status, 401);
    const allowed = await yesterdayGet(
      new Request("https://resonance3.vercel.app/api/youtube/yesterday", {
        headers: { authorization: "Bearer hub-secret" },
      }),
    );
    assert.equal(allowed.status, 200);
    const body = await allowed.json();
    assert.equal(body.day, "2026-10-29");
    assert.equal(JSON.stringify(body).includes(REFRESH), false);

    const cronDenied = await cronGet(new Request("https://resonance3.vercel.app/api/cron/youtube"));
    assert.equal(cronDenied.status, 401);
    const startDenied = await startGet(new Request("https://resonance3.vercel.app/api/youtube/oauth/start"));
    assert.equal(startDenied.status, 401);
  });

  it("skips when the health check failed or is missing, and writes no channel data", async () => {
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    process.env.GOOGLE_YT_CLIENT_ID = "client-id";
    process.env.GOOGLE_YT_CLIENT_SECRET = "client-secret";
    setSqlClientForTests(memorySql());
    await migrate();
    await saveYouTubeConnection({
      refreshToken: REFRESH,
      channelId: "UC123",
      channelTitle: "Resonance",
      subscribers: 1240,
      videoCount: 2,
    });
    let fetches = 0;
    const logs: string[] = [];
    setYouTubeFetchForTests(async () => {
      fetches += 1;
      return new Response("no", { status: 500 });
    });
    const log = (message: string) => logs.push(message);

    const missing = await runScheduledYouTubePull({ now: NOW, slot: "after-9am-ct", log });
    assert.equal(missing.status, "skipped");
    assert.equal(missing.message, SKIPPED_HEALTH_CHECK);

    await rememberHealthMark(false, "2026-10-30T17:30:00.000Z");
    const failed = await runScheduledYouTubePull({ now: NOW, slot: "after-1pm-ct", log });
    assert.equal(failed.status, "skipped");
    assert.equal(failed.message, SKIPPED_HEALTH_CHECK);
    assert.deepEqual(logs, [SKIPPED_HEALTH_CHECK, SKIPPED_HEALTH_CHECK]);
    assert.equal(fetches, 0);

    const days = await sqlQuery(`SELECT day FROM youtube_channel_days`);
    const videos = await sqlQuery(`SELECT video_id FROM youtube_videos`);
    const videoDays = await sqlQuery(`SELECT video_id FROM youtube_video_days`);
    const pulls = await sqlQuery<{ status: string; message: string }>(
      `SELECT status, message FROM youtube_pulls ORDER BY id`,
    );
    assert.equal(days.length, 0);
    assert.equal(videos.length, 0);
    assert.equal(videoDays.length, 0);
    assert.equal(pulls.length, 2);
    assert.equal(
      pulls.every((row) => row.status === "skipped" && row.message === SKIPPED_HEALTH_CHECK),
      true,
    );
    const loaded = await loadYouTubeAnalytics(NOW);
    assert.equal(loaded.days.length, 0);
    assert.equal(loaded.videos.length, 0);
    const screen = presentYouTubeScreen(loaded, { publicMode: false, connectReady: true, denied: false });
    assert.equal(screen?.skipMessage, SKIPPED_HEALTH_CHECK);
    assert.equal(presentYouTubeScreen(loaded, { publicMode: true, connectReady: true, denied: false }), null);
  });
});
