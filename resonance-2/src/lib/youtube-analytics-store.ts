import "server-only";

import { readHealthMark } from "@/lib/health-mark";
import { sqlQuery, sqlTransaction, type SqlStatement } from "@/lib/pg/client";
import {
  emptyAnalyticsModel,
  finiteNumber,
  healthMarkPasses,
  trendWindow,
  type ParsedChannelDay,
  type YouTubeAnalyticsModel,
  type YouTubeDayPoint,
  type YouTubeVideoMetric,
} from "@/lib/youtube-analytics";

export type YouTubePullStatus = "ok" | "skipped" | "error";

function dayText(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value ?? "");
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return match?.[1] ?? "";
}

function asNumber(value: unknown): number | null {
  return finiteNumber(value);
}

export async function readYouTubeRefreshToken(): Promise<string | null> {
  const rows = await sqlQuery<{ refresh_token: string }>(
    `SELECT refresh_token FROM youtube_oauth WHERE id = 1`,
  );
  const token = rows[0]?.refresh_token?.trim() ?? "";
  return token || null;
}

export async function saveYouTubeConnection(input: {
  refreshToken: string;
  channelId: string | null;
  channelTitle: string | null;
  subscribers: number | null;
  videoCount: number | null;
}): Promise<void> {
  await sqlQuery(
    `INSERT INTO youtube_oauth (
       id, refresh_token, channel_id, channel_title, subscriber_count, video_count, connected_at, updated_at
     )
     VALUES (1, $1, $2, $3, $4, $5, now(), now())
     ON CONFLICT (id) DO UPDATE SET
       refresh_token = EXCLUDED.refresh_token,
       channel_id = COALESCE(EXCLUDED.channel_id, youtube_oauth.channel_id),
       channel_title = COALESCE(EXCLUDED.channel_title, youtube_oauth.channel_title),
       subscriber_count = COALESCE(EXCLUDED.subscriber_count, youtube_oauth.subscriber_count),
       video_count = COALESCE(EXCLUDED.video_count, youtube_oauth.video_count),
       updated_at = now()`,
    [input.refreshToken, input.channelId, input.channelTitle, input.subscribers, input.videoCount],
  );
}

export async function updateYouTubeChannel(input: {
  channelId: string | null;
  channelTitle: string | null;
  subscribers: number | null;
  videoCount: number | null;
}): Promise<void> {
  await sqlQuery(
    `UPDATE youtube_oauth
     SET channel_id = COALESCE($1, channel_id),
         channel_title = COALESCE($2, channel_title),
         subscriber_count = $3,
         video_count = $4,
         updated_at = now()
     WHERE id = 1`,
    [input.channelId, input.channelTitle, input.subscribers, input.videoCount],
  );
}

export async function recordYouTubePull(input: {
  slot: string;
  status: YouTubePullStatus;
  message: string;
}): Promise<void> {
  const slot = input.slot.replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "manual";
  const message = input.message.slice(0, 200);
  await sqlQuery(
    `INSERT INTO youtube_pulls (slot, status, message) VALUES ($1, $2, $3)`,
    [slot, input.status, message],
  );
}

export async function readYouTubePullGate(now: Date): Promise<{ healthPasses: boolean }> {
  try {
    const mark = await readHealthMark();
    return { healthPasses: healthMarkPasses(mark, now) };
  } catch {
    return { healthPasses: false };
  }
}

export async function saveYouTubePullData(input: {
  days: readonly ParsedChannelDay[];
  videos: readonly YouTubeVideoMetric[];
  yesterdayVideos: readonly YouTubeVideoMetric[];
  windowStart: string;
  windowEnd: string;
}): Promise<void> {
  const statements: SqlStatement[] = [];
  for (const day of input.days) {
    statements.push({
      text: `INSERT INTO youtube_channel_days (day, views, watch_time_minutes, avg_view_duration_seconds, pulled_at)
             VALUES ($1, $2, $3, $4, now())
             ON CONFLICT (day) DO UPDATE SET
               views = EXCLUDED.views,
               watch_time_minutes = EXCLUDED.watch_time_minutes,
               avg_view_duration_seconds = EXCLUDED.avg_view_duration_seconds,
               pulled_at = now()`,
      params: [day.day, day.views, day.watchMinutes, day.avgSeconds],
    });
  }
  for (const video of input.videos) {
    statements.push({
      text: `INSERT INTO youtube_videos (
               video_id, title, views, watch_time_minutes, avg_view_percentage,
               impressions, ctr, likes, comments, window_start, window_end, updated_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
             ON CONFLICT (video_id) DO UPDATE SET
               title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE youtube_videos.title END,
               views = EXCLUDED.views,
               watch_time_minutes = EXCLUDED.watch_time_minutes,
               avg_view_percentage = EXCLUDED.avg_view_percentage,
               impressions = EXCLUDED.impressions,
               ctr = EXCLUDED.ctr,
               likes = EXCLUDED.likes,
               comments = EXCLUDED.comments,
               window_start = EXCLUDED.window_start,
               window_end = EXCLUDED.window_end,
               updated_at = now()`,
      params: [
        video.videoId,
        video.title,
        video.views,
        video.watchMinutes,
        video.avgPercent,
        video.impressions,
        video.ctr,
        video.likes,
        video.comments,
        input.windowStart,
        input.windowEnd,
      ],
    });
  }
  for (const video of input.yesterdayVideos) {
    if (input.videos.some((row) => row.videoId === video.videoId)) continue;
    statements.push({
      text: `INSERT INTO youtube_videos (video_id, title, updated_at)
             VALUES ($1, $2, now())
             ON CONFLICT (video_id) DO UPDATE SET
               title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE youtube_videos.title END,
               updated_at = now()`,
      params: [video.videoId, video.title],
    });
  }
  for (const video of input.yesterdayVideos) {
    statements.push({
      text: `INSERT INTO youtube_video_days (
               video_id, day, views, watch_time_minutes, avg_view_percentage,
               impressions, ctr, likes, comments, pulled_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
             ON CONFLICT (video_id, day) DO UPDATE SET
               views = EXCLUDED.views,
               watch_time_minutes = EXCLUDED.watch_time_minutes,
               avg_view_percentage = EXCLUDED.avg_view_percentage,
               impressions = EXCLUDED.impressions,
               ctr = EXCLUDED.ctr,
               likes = EXCLUDED.likes,
               comments = EXCLUDED.comments,
               pulled_at = now()`,
      params: [
        video.videoId,
        input.windowEnd,
        video.views,
        video.watchMinutes,
        video.avgPercent,
        video.impressions,
        video.ctr,
        video.likes,
        video.comments,
      ],
    });
  }
  if (statements.length === 0) return;
  await sqlTransaction(statements);
}

type DayRow = {
  day: unknown;
  views: unknown;
  watch_time_minutes: unknown;
  avg_view_duration_seconds: unknown;
};

type VideoRow = {
  video_id: string;
  title: string;
  views: unknown;
  watch_time_minutes: unknown;
  avg_view_percentage: unknown;
  impressions: unknown;
  ctr: unknown;
  likes: unknown;
  comments: unknown;
};

function videoFromRow(row: VideoRow): YouTubeVideoMetric {
  return {
    videoId: row.video_id,
    title: row.title ?? "",
    views: asNumber(row.views),
    watchMinutes: asNumber(row.watch_time_minutes),
    avgPercent: asNumber(row.avg_view_percentage),
    impressions: asNumber(row.impressions),
    ctr: asNumber(row.ctr),
    likes: asNumber(row.likes),
    comments: asNumber(row.comments),
  };
}

export async function loadYouTubeAnalytics(now = new Date()): Promise<YouTubeAnalyticsModel> {
  const window = trendWindow(now);
  const base = emptyAnalyticsModel(now);
  const accounts = await sqlQuery<{
    channel_title: string | null;
    subscriber_count: unknown;
    video_count: unknown;
  }>(
    `SELECT channel_title, subscriber_count, video_count FROM youtube_oauth WHERE id = 1`,
  );
  const account = accounts[0];
  const pulls = await sqlQuery<{ status: string; message: string }>(
    `SELECT status, message FROM youtube_pulls ORDER BY started_at DESC, id DESC LIMIT 1`,
  );
  const days = await sqlQuery<DayRow>(
    `SELECT day, views, watch_time_minutes, avg_view_duration_seconds
     FROM youtube_channel_days
     WHERE day >= $1 AND day <= $2
     ORDER BY day`,
    [window.start, window.end],
  );
  const videos = await sqlQuery<VideoRow>(
    `SELECT video_id, title, views, watch_time_minutes, avg_view_percentage, impressions, ctr, likes, comments
     FROM youtube_videos
     ORDER BY video_id`,
  );
  const last = pulls[0];
  const status = last?.status === "ok" || last?.status === "skipped" || last?.status === "error" ? last.status : null;
  const points: YouTubeDayPoint[] = days
    .map((row) => ({
      day: dayText(row.day),
      views: asNumber(row.views),
      watchMinutes: asNumber(row.watch_time_minutes),
      avgSeconds: asNumber(row.avg_view_duration_seconds),
    }))
    .filter((row) => row.day);
  const ranked = videos
    .map(videoFromRow)
    .filter((video) => video.views !== null || video.watchMinutes !== null || video.likes !== null)
    .sort((a, b) => (b.views ?? -1) - (a.views ?? -1) || a.videoId.localeCompare(b.videoId));
  return {
    ...base,
    connected: Boolean(account),
    channelTitle: account?.channel_title ?? null,
    subscribers: asNumber(account?.subscriber_count),
    videoCount: asNumber(account?.video_count),
    lastStatus: status,
    lastMessage: last?.message ?? null,
    days: points,
    videos: ranked.slice(0, 50),
  };
}

export type YesterdayNumbers = {
  ok: true;
  day: string;
  channel: {
    subscribers: number | null;
    views: number | null;
    watchTimeMinutes: number | null;
    avgViewDurationSeconds: number | null;
  } | null;
  videos: {
    videoId: string;
    title: string;
    views: number | null;
    watchTimeMinutes: number | null;
    avgPercentViewed: number | null;
    impressions: number | null;
    ctr: number | null;
    likes: number | null;
    comments: number | null;
  }[];
};

export async function loadYesterdayNumbers(now = new Date()): Promise<YesterdayNumbers> {
  const { yesterday } = trendWindow(now);
  const accounts = await sqlQuery<{ subscriber_count: unknown }>(
    `SELECT subscriber_count FROM youtube_oauth WHERE id = 1`,
  );
  const days = await sqlQuery<DayRow>(
    `SELECT day, views, watch_time_minutes, avg_view_duration_seconds
     FROM youtube_channel_days
     WHERE day = $1`,
    [yesterday],
  );
  const videos = await sqlQuery<VideoRow>(
    `SELECT v.video_id, v.title, d.views, d.watch_time_minutes, d.avg_view_percentage, d.impressions, d.ctr, d.likes, d.comments
     FROM youtube_video_days d
     JOIN youtube_videos v ON v.video_id = d.video_id
     WHERE d.day = $1
     ORDER BY v.video_id`,
    [yesterday],
  );
  const day = days[0];
  const subscribers = asNumber(accounts[0]?.subscriber_count);
  const channel =
    day || subscribers !== null
      ? {
          subscribers,
          views: asNumber(day?.views),
          watchTimeMinutes: asNumber(day?.watch_time_minutes),
          avgViewDurationSeconds: asNumber(day?.avg_view_duration_seconds),
        }
      : null;
  const lines = videos
    .map(videoFromRow)
    .sort((a, b) => (b.views ?? -1) - (a.views ?? -1) || a.videoId.localeCompare(b.videoId))
    .map((video) => ({
      videoId: video.videoId,
      title: video.title,
      views: video.views,
      watchTimeMinutes: video.watchMinutes,
      avgPercentViewed: video.avgPercent,
      impressions: video.impressions,
      ctr: video.ctr,
      likes: video.likes,
      comments: video.comments,
    }));
  return { ok: true, day: yesterday, channel, videos: lines };
}
