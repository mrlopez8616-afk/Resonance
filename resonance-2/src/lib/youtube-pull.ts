import "server-only";

import {
  fetchChannelDays,
  fetchVideoMetrics,
  fetchVideoTitles,
  fetchYouTubeChannel,
  refreshAccessToken,
  takeYouTubeGoogleFailure,
} from "@/lib/youtube-google";
import {
  readYouTubePullGate,
  readYouTubeRefreshToken,
  recordYouTubePull,
  saveYouTubePullData,
  updateYouTubeChannel,
} from "@/lib/youtube-analytics-store";
import { youtubeClientConfig } from "@/lib/youtube-oauth";
import { SKIPPED_HEALTH_CHECK, decideYouTubePull, trendWindow, type YouTubeVideoMetric } from "@/lib/youtube-analytics";

export type YouTubePullResult = {
  ok: boolean;
  status: "ok" | "skipped" | "error";
  message: string;
};

function failAt(step: string): { ok: false; message: string } {
  const detail = takeYouTubeGoogleFailure() ?? "no detail";
  console.error(`youtube pull failed at ${step}: ${detail}`);
  return { ok: false, message: "pull failed" };
}

function safeErrorLine(error: unknown): string {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : "unknown error";
  return raw.replace(/[a-z]+:\/\/[^\s]+/gi, "[url]").slice(0, 300);
}

function stampTitles(videos: YouTubeVideoMetric[], titles: ReadonlyMap<string, string>): YouTubeVideoMetric[] {
  return videos.map((video) => ({ ...video, title: titles.get(video.videoId) ?? video.title }));
}

export async function pullYouTubeAnalytics(now: Date): Promise<{ ok: true } | { ok: false; message: string }> {
  const config = youtubeClientConfig();
  const refreshToken = await readYouTubeRefreshToken();
  if (!config || !refreshToken) {
    console.error(`youtube pull not connected: ${!config ? "client config missing" : "no stored token"}`);
    return { ok: false, message: "not connected" };
  }
  takeYouTubeGoogleFailure();
  const accessToken = await refreshAccessToken(config, refreshToken);
  if (!accessToken) return failAt("token refresh");
  const channel = await fetchYouTubeChannel(accessToken);
  if (!channel) return failAt("channel (YouTube Data API)");
  const window = trendWindow(now);
  const days = await fetchChannelDays(accessToken, window.start, window.end);
  if (!days) return failAt("channel days (YouTube Analytics API)");
  const videos = await fetchVideoMetrics(accessToken, window.start, window.end);
  if (!videos) return failAt("video metrics (YouTube Analytics API)");
  const yesterdayVideos = await fetchVideoMetrics(accessToken, window.yesterday, window.yesterday);
  if (!yesterdayVideos) return failAt("yesterday video metrics (YouTube Analytics API)");
  const titleIds: string[] = [];
  for (const video of [...videos, ...yesterdayVideos]) {
    if (!titleIds.includes(video.videoId)) titleIds.push(video.videoId);
  }
  const titles = await fetchVideoTitles(accessToken, titleIds);
  await updateYouTubeChannel({
    channelId: channel.id,
    channelTitle: channel.title || null,
    subscribers: channel.subscribers,
    videoCount: channel.videoCount,
  });
  await saveYouTubePullData({
    days,
    videos: stampTitles(videos, titles),
    yesterdayVideos: stampTitles(yesterdayVideos, titles),
    windowStart: window.start,
    windowEnd: window.end,
  });
  return { ok: true };
}

export async function runScheduledYouTubePull(input: {
  now?: Date;
  slot: string;
  log?: (message: string) => void;
}): Promise<YouTubePullResult> {
  const now = input.now ?? new Date();
  const log = input.log ?? console.info;
  const gate = await readYouTubePullGate(now);
  const decision = decideYouTubePull(gate);
  if (!decision.run) {
    const message = decision.message ?? SKIPPED_HEALTH_CHECK;
    log(message);
    try {
      await recordYouTubePull({ slot: input.slot, status: "skipped", message });
    } catch {
      console.error("youtube pull log failed");
    }
    return { ok: false, status: "skipped", message };
  }
  try {
    const result = await pullYouTubeAnalytics(now);
    if (result.ok) {
      await recordYouTubePull({ slot: input.slot, status: "ok", message: "ok" });
      return { ok: true, status: "ok", message: "ok" };
    }
    await recordYouTubePull({ slot: input.slot, status: "error", message: result.message });
    return { ok: false, status: "error", message: result.message };
  } catch (error) {
    console.error(`youtube pull threw: ${safeErrorLine(error)}`);
    try {
      await recordYouTubePull({ slot: input.slot, status: "error", message: "pull failed" });
    } catch {
      console.error("youtube pull log failed");
    }
    return { ok: false, status: "error", message: "pull failed" };
  }
}
