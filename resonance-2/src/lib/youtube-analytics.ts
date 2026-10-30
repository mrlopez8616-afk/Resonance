import { NOT_CONNECTED, NOT_RECORDED } from "@/lib/youtube-node";

/**
 * YouTube analytics.
 * Pulls are three Hobby-safe daily crons, each once per day, in the UTC hour
 * that falls after the 9 AM, 1 PM, and 6 PM America/Chicago health checks
 * in both CST and CDT. Hobby may invoke a daily cron any time inside that hour.
 * A pull runs when that health check passed, or when YouTube's own dependencies
 * are healthy. Otherwise the job logs SKIPPED_UNHEALTHY and the page shows it.
 */

export const SKIPPED_UNHEALTHY = "skipped: system unhealthy";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
] as const;

export const YOUTUBE_OAUTH_REDIRECT = "https://resonance3.vercel.app/api/youtube/oauth/callback";

/** Four hours covers the gap from a health check to the following pull hour. */
export const HEALTH_MARK_MAX_AGE_MS = 4 * 60 * 60 * 1000;

export const YOUTUBE_TREND_DAYS = 28;
export const YOUTUBE_VIDEO_CAP = 50;

export const CHANNEL_METRICS = ["views", "estimatedMinutesWatched", "averageViewDuration"] as const;

export const VIDEO_METRICS = [
  "views",
  "estimatedMinutesWatched",
  "averageViewPercentage",
  "likes",
  "comments",
  "videoThumbnailImpressions",
  "videoThumbnailImpressionsClickRate",
] as const;

export const VIDEO_METRICS_CORE = VIDEO_METRICS.slice(0, 5);

export const YOUTUBE_CRON_JOBS = [
  { path: "/api/cron/youtube", schedule: "0 16 * * *" },
  { path: "/api/cron/youtube", schedule: "0 20 * * *" },
  { path: "/api/cron/youtube", schedule: "0 1 * * *" },
] as const;

/**
 * Every cron, with the slot a health gate would use.
 * Only the YouTube rows are gated in this change.
 */
export const CRON_GATE_PLAN = [
  {
    path: "/api/cron/backup",
    schedule: "0 8 * * *",
    slot: "08:00 UTC daily (about 3:00 AM CDT / 2:00 AM CST), after a future overnight health check",
    gated: false,
  },
  {
    path: "/api/cron/youtube",
    schedule: "0 16 * * *",
    slot: "16:00 UTC hour, after the ~9 AM CT health check",
    gated: true,
  },
  {
    path: "/api/cron/youtube",
    schedule: "0 20 * * *",
    slot: "20:00 UTC hour, after the ~1 PM CT health check",
    gated: true,
  },
  {
    path: "/api/cron/youtube",
    schedule: "0 1 * * *",
    slot: "01:00 UTC hour, after the ~6 PM CT health check",
    gated: true,
  },
] as const;

export function isHobbyDailySchedule(schedule: string): boolean {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minute, hour, day, month, weekday] = parts;
  if (!minute || !hour || !/^\d{1,2}$/.test(minute) || !/^\d{1,2}$/.test(hour)) return false;
  if (day !== "*" || month !== "*" || weekday !== "*") return false;
  const minuteN = Number(minute);
  const hourN = Number(hour);
  return minuteN >= 0 && minuteN <= 59 && hourN >= 0 && hourN <= 23;
}

export function youtubeSlotForSchedule(schedule: string | null | undefined): string {
  if (schedule === "0 16 * * *") return "after-9am-ct";
  if (schedule === "0 20 * * *") return "after-1pm-ct";
  if (schedule === "0 1 * * *") return "after-6pm-ct";
  return "manual";
}

export function decideYouTubePull(input: {
  healthPasses: boolean;
  youtubeDepsHealthy: boolean;
}): { run: boolean; message: string | null } {
  if (input.healthPasses || input.youtubeDepsHealthy) return { run: true, message: null };
  return { run: false, message: SKIPPED_UNHEALTHY };
}

export function healthMarkPasses(
  mark: { ok: boolean; checkedAt: string } | null,
  now: Date,
): boolean {
  if (!mark?.ok) return false;
  const at = Date.parse(mark.checkedAt);
  if (!Number.isFinite(at)) return false;
  const age = now.getTime() - at;
  return age >= -60_000 && age <= HEALTH_MARK_MAX_AGE_MS;
}

export function chicagoDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addIsoDays(iso: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function trendWindow(now: Date): { start: string; end: string; yesterday: string } {
  const yesterday = addIsoDays(chicagoDate(now), -1);
  return {
    start: addIsoDays(yesterday, -(YOUTUBE_TREND_DAYS - 1)),
    end: yesterday,
    yesterday,
  };
}

export function formatCount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return NOT_RECORDED;
  return Math.round(value).toLocaleString("en-US");
}

export function formatWatchTime(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return NOT_RECORDED;
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return NOT_RECORDED;
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return NOT_RECORDED;
  return `${value.toFixed(1)}%`;
}

export function dayLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export type YouTubeDayPoint = {
  day: string;
  views: number | null;
  watchMinutes: number | null;
  avgSeconds: number | null;
};

export type YouTubeVideoMetric = {
  videoId: string;
  title: string;
  views: number | null;
  watchMinutes: number | null;
  avgPercent: number | null;
  impressions: number | null;
  ctr: number | null;
  likes: number | null;
  comments: number | null;
};

export type YouTubeAnalyticsModel = {
  connected: boolean;
  channelTitle: string | null;
  subscribers: number | null;
  videoCount: number | null;
  lastStatus: "ok" | "skipped" | "error" | null;
  lastMessage: string | null;
  days: YouTubeDayPoint[];
  videos: YouTubeVideoMetric[];
  windowStart: string;
  windowEnd: string;
};

export type YouTubeTotalFace = {
  id: string;
  name: string;
  headline: string;
  status: string;
};

export type YouTubeTrendBar = {
  id: string;
  label: string;
  views: number;
};

export type YouTubeVideoLine = {
  videoId: string;
  title: string;
  views: string;
  watchTime: string;
  avgPercent: string;
  impressions: string;
  ctr: string;
  likes: string;
  comments: string;
};

export type YouTubeScreen = {
  skipMessage: string | null;
  notice: string | null;
  totals: YouTubeTotalFace[];
  trend: YouTubeTrendBar[];
  trendCaption: string;
  videos: YouTubeVideoLine[];
  connectHref: string | null;
  connectLabel: string | null;
  channelStats: { subscribers: string; views: string; videos: string };
  channelFace: { figure: string; status: string | null; live: boolean };
  homeChannelLine: string | null;
};

export function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return number;
}

export function latestSubscribers(model: YouTubeAnalyticsModel): number | null {
  return finiteNumber(model.subscribers);
}

export function summarizeChannel(model: YouTubeAnalyticsModel): {
  subscribers: number | null;
  views: number | null;
  watchMinutes: number | null;
  avgSeconds: number | null;
} {
  let views = 0;
  let watch = 0;
  let weighted = 0;
  let weight = 0;
  let anyViews = false;
  let anyWatch = false;
  for (const day of model.days) {
    if (day.views !== null) {
      anyViews = true;
      views += day.views;
      if (day.avgSeconds !== null && day.views > 0) {
        weighted += day.avgSeconds * day.views;
        weight += day.views;
      }
    }
    if (day.watchMinutes !== null) {
      anyWatch = true;
      watch += day.watchMinutes;
    }
  }
  return {
    subscribers: latestSubscribers(model),
    views: anyViews ? views : null,
    watchMinutes: anyWatch ? watch : null,
    avgSeconds: weight > 0 ? weighted / weight : null,
  };
}

export function fillTrend(model: YouTubeAnalyticsModel): YouTubeTrendBar[] {
  if (model.days.length === 0) return [];
  const byDay = new Map(model.days.map((day) => [day.day, day.views ?? 0]));
  const bars: YouTubeTrendBar[] = [];
  for (let day = model.windowStart; day <= model.windowEnd; day = addIsoDays(day, 1)) {
    bars.push({ id: day, label: dayLabel(day), views: byDay.get(day) ?? 0 });
    if (bars.length > YOUTUBE_TREND_DAYS + 2) break;
  }
  return bars;
}

function videoLine(video: YouTubeVideoMetric): YouTubeVideoLine {
  return {
    videoId: video.videoId,
    title: video.title.trim() || video.videoId,
    views: formatCount(video.views),
    watchTime: formatWatchTime(video.watchMinutes),
    avgPercent: formatPercent(video.avgPercent),
    impressions: formatCount(video.impressions),
    ctr: formatPercent(video.ctr),
    likes: formatCount(video.likes),
    comments: formatCount(video.comments),
  };
}

/** Private screen. Public mode returns null so analytics never reach the shared view. */
export function presentYouTubeScreen(
  model: YouTubeAnalyticsModel,
  options: { publicMode: boolean; connectReady: boolean; denied: boolean },
): YouTubeScreen | null {
  if (options.publicMode) return null;
  const totals = summarizeChannel(model);
  const skipMessage = model.lastMessage === SKIPPED_UNHEALTHY ? SKIPPED_UNHEALTHY : null;
  const failed = !skipMessage && model.lastStatus === "error" && model.lastMessage === "pull failed";
  const subscriberText = formatCount(totals.subscribers);
  const viewsText = formatCount(totals.views);
  const status = skipMessage ?? (failed ? "pull failed" : null);
  const connected = model.connected;
  let notice: string | null = null;
  if (options.denied) notice = "Google sign-in was not completed.";
  else if (!connected && !options.connectReady) notice = "Google sign-in is not set up yet.";
  const connectHref = options.connectReady ? "/api/youtube/oauth/start" : null;
  const connectLabel = connectHref ? (connected ? "Reconnect channel" : "Connect channel") : null;
  const figure = connected ? subscriberText : `Stats ${NOT_CONNECTED}`;
  const cardStatus =
    status ?? (connected ? (totals.views === null ? NOT_RECORDED : `${viewsText} views`) : null);
  const homeChannelLine = skipMessage
    ? `Channel · ${skipMessage}`
    : failed
      ? "Channel · pull failed"
      : connected
        ? totals.subscribers === null
          ? "Channel · not recorded"
          : `Channel · ${subscriberText} subs`
        : null;
  return {
    skipMessage,
    notice,
    totals: [
      { id: "subscribers", name: "Subscribers", headline: subscriberText, status: "channel" },
      { id: "views", name: "Views", headline: viewsText, status: "28 days" },
      { id: "watch-time", name: "Watch time", headline: formatWatchTime(totals.watchMinutes), status: "28 days" },
      {
        id: "avg-duration",
        name: "Avg view",
        headline: formatDuration(totals.avgSeconds),
        status: "28 days",
      },
    ],
    trend: fillTrend(model),
    trendCaption: `${dayLabel(model.windowStart)} – ${dayLabel(model.windowEnd)}`,
    videos: model.videos.map(videoLine),
    connectHref,
    connectLabel,
    channelStats: {
      subscribers: subscriberText,
      views: viewsText,
      videos: formatCount(model.videoCount),
    },
    channelFace: {
      figure,
      status: cardStatus,
      live: connected && !skipMessage && !failed,
    },
    homeChannelLine,
  };
}

export function analyticsReportUrl(input: {
  start: string;
  end: string;
  metrics: readonly string[];
  dimensions: string;
  maxResults?: number;
  sort?: string;
}): string {
  const url = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
  url.searchParams.set("ids", "channel==MINE");
  url.searchParams.set("startDate", input.start);
  url.searchParams.set("endDate", input.end);
  url.searchParams.set("metrics", input.metrics.join(","));
  url.searchParams.set("dimensions", input.dimensions);
  if (input.maxResults) url.searchParams.set("maxResults", String(input.maxResults));
  if (input.sort) url.searchParams.set("sort", input.sort);
  return url.toString();
}

export function reportTable(json: unknown): { columns: string[]; rows: string[][] } | null {
  if (!json || typeof json !== "object") return null;
  const headers = (json as { columnHeaders?: unknown }).columnHeaders;
  const rawRows = (json as { rows?: unknown }).rows;
  if (!Array.isArray(headers)) return { columns: [], rows: [] };
  const columns = headers.map((header) => {
    if (!header || typeof header !== "object") return "";
    const name = (header as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  });
  if (!Array.isArray(rawRows)) return { columns, rows: [] };
  const rows = rawRows
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))));
  return { columns, rows };
}

export function columnIndex(columns: readonly string[], name: string): number {
  return columns.indexOf(name);
}

export type ParsedChannelDay = {
  day: string;
  views: number | null;
  watchMinutes: number | null;
  avgSeconds: number | null;
};

export function parseChannelDays(json: unknown): ParsedChannelDay[] {
  const table = reportTable(json);
  if (!table) return [];
  const dayIndex = columnIndex(table.columns, "day");
  const viewsIndex = columnIndex(table.columns, "views");
  const watchIndex = columnIndex(table.columns, "estimatedMinutesWatched");
  const avgIndex = columnIndex(table.columns, "averageViewDuration");
  const days: ParsedChannelDay[] = [];
  for (const row of table.rows) {
    const day = dayIndex >= 0 ? row[dayIndex] ?? "" : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    days.push({
      day,
      views: viewsIndex >= 0 ? finiteNumber(row[viewsIndex]) : null,
      watchMinutes: watchIndex >= 0 ? finiteNumber(row[watchIndex]) : null,
      avgSeconds: avgIndex >= 0 ? finiteNumber(row[avgIndex]) : null,
    });
  }
  return days;
}

export function parseVideoRows(json: unknown): YouTubeVideoMetric[] {
  const table = reportTable(json);
  if (!table) return [];
  const idIndex = columnIndex(table.columns, "video");
  const viewsIndex = columnIndex(table.columns, "views");
  const watchIndex = columnIndex(table.columns, "estimatedMinutesWatched");
  const avgIndex = columnIndex(table.columns, "averageViewPercentage");
  const likesIndex = columnIndex(table.columns, "likes");
  const commentsIndex = columnIndex(table.columns, "comments");
  const impressionsIndex = columnIndex(table.columns, "videoThumbnailImpressions");
  const ctrIndex = columnIndex(table.columns, "videoThumbnailImpressionsClickRate");
  const videos: YouTubeVideoMetric[] = [];
  for (const row of table.rows) {
    const videoId = idIndex >= 0 ? (row[idIndex] ?? "").trim() : "";
    if (!/^[A-Za-z0-9_-]{6,32}$/.test(videoId)) continue;
    videos.push({
      videoId,
      title: "",
      views: viewsIndex >= 0 ? finiteNumber(row[viewsIndex]) : null,
      watchMinutes: watchIndex >= 0 ? finiteNumber(row[watchIndex]) : null,
      avgPercent: avgIndex >= 0 ? finiteNumber(row[avgIndex]) : null,
      impressions: impressionsIndex >= 0 ? finiteNumber(row[impressionsIndex]) : null,
      ctr: ctrIndex >= 0 ? finiteNumber(row[ctrIndex]) : null,
      likes: likesIndex >= 0 ? finiteNumber(row[likesIndex]) : null,
      comments: commentsIndex >= 0 ? finiteNumber(row[commentsIndex]) : null,
    });
    if (videos.length >= YOUTUBE_VIDEO_CAP) break;
  }
  return videos;
}

export function parseChannelPayload(json: unknown): {
  id: string;
  title: string;
  subscribers: number | null;
  videoCount: number | null;
} | null {
  if (!json || typeof json !== "object") return null;
  const items = (json as { items?: unknown }).items;
  if (!Array.isArray(items) || !items[0] || typeof items[0] !== "object") return null;
  const item = items[0] as {
    id?: unknown;
    snippet?: { title?: unknown };
    statistics?: {
      hiddenSubscriberCount?: unknown;
      subscriberCount?: unknown;
      videoCount?: unknown;
    };
  };
  const id = typeof item.id === "string" ? item.id.trim() : "";
  if (!id) return null;
  const title = typeof item.snippet?.title === "string" ? item.snippet.title.trim().slice(0, 180) : "";
  const hidden = item.statistics?.hiddenSubscriberCount === true;
  return {
    id,
    title,
    subscribers: hidden ? null : finiteNumber(item.statistics?.subscriberCount),
    videoCount: finiteNumber(item.statistics?.videoCount),
  };
}

export function readTokenField(json: unknown, field: "access_token" | "refresh_token"): string | null {
  if (!json || typeof json !== "object") return null;
  const value = (json as Record<string, unknown>)[field];
  if (typeof value !== "string") return null;
  const token = value.trim();
  return token ? token : null;
}

export function metricUnsupported(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const error = (json as { error?: { message?: unknown } }).error;
  const message = typeof error?.message === "string" ? error.message : "";
  return /not supported|unknown metric|invalid metric|videoThumbnailImpressions/i.test(message);
}

export function emptyAnalyticsModel(now: Date): YouTubeAnalyticsModel {
  const window = trendWindow(now);
  return {
    connected: false,
    channelTitle: null,
    subscribers: null,
    videoCount: null,
    lastStatus: null,
    lastMessage: null,
    days: [],
    videos: [],
    windowStart: window.start,
    windowEnd: window.end,
  };
}

export function blankChannelFace(): { figure: string; status: string | null; live: boolean } {
  return { figure: `Stats ${NOT_CONNECTED}`, status: null, live: false };
}
