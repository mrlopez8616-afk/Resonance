import "server-only";

import {
  fetchChannelDays,
  fetchVideoMetrics,
  fetchVideoTitles,
  fetchYouTubeChannel,
  refreshAccessToken,
} from "@/lib/youtube-google";
import {
  readYouTubePullGate,
  readYouTubeRefreshToken,
  recordYouTubePull,
  saveYouTubePullData,
  updateYouTubeChannel,
} from "@/lib/youtube-analytics-store";
import { youtubeClientConfig } from "@/lib/youtube-oauth";
import { SKIPPED_UNHEALTHY, decideYouTubePull, trendWindow, type YouTubeVideoMetric } from "@/lib/youtube-analytics";

export type YouTubePullResult = {
  ok: boolean;
  status: "ok" | "skipped" | "error";
  message: string;
};

function stampTitles(videos: YouTubeVideoMetric[], titles: ReadonlyMap<string, string>): YouTubeVideoMetric[] {
  return videos.map((video) => ({ ...video, title: titles.get(video.videoId) ?? video.title }));
}

export async function pullYouTubeAnalytics(now: Date): Promise<{ ok: true } | { ok: false; message: string }> {
  const config = youtubeClientConfig();
  const refreshToken = await readYouTubeRefreshToken();
  if (!config || !refreshToken) return { ok: false, message: "not connected" };
  const accessToken = await refreshAccessToken(config, refreshToken);
  if (!accessToken) return { ok: false, message: "pull failed" };
  const channel = await fetchYouTubeChannel(accessToken);
  if (!channel) return { ok: false, message: "pull failed" };
  const window = trendWindow(now);
  const days = await fetchChannelDays(accessToken, window.start, window.end);
  if (!days) return { ok: false, message: "pull failed" };
  const videos = await fetchVideoMetrics(accessToken, window.start, window.end);
  if (!videos) return { ok: false, message: "pull failed" };
  const yesterdayVideos = await fetchVideoMetrics(accessToken, window.yesterday, window.yesterday);
  if (!yesterdayVideos) return { ok: false, message: "pull failed" };
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
    log(SKIPPED_UNHEALTHY);
    try {
      await recordYouTubePull({ slot: input.slot, status: "skipped", message: SKIPPED_UNHEALTHY });
    } catch {
      console.error("youtube pull log failed");
    }
    return { ok: false, status: "skipped", message: SKIPPED_UNHEALTHY };
  }
  try {
    const result = await pullYouTubeAnalytics(now);
    if (result.ok) {
      await recordYouTubePull({ slot: input.slot, status: "ok", message: "ok" });
      return { ok: true, status: "ok", message: "ok" };
    }
    console.error("youtube pull failed");
    await recordYouTubePull({ slot: input.slot, status: "error", message: result.message });
    return { ok: false, status: "error", message: result.message };
  } catch {
    console.error("youtube pull failed");
    try {
      await recordYouTubePull({ slot: input.slot, status: "error", message: "pull failed" });
    } catch {
      console.error("youtube pull log failed");
    }
    return { ok: false, status: "error", message: "pull failed" };
  }
}
