import "server-only";

import {
  CHANNEL_METRICS,
  VIDEO_METRICS,
  VIDEO_METRICS_CORE,
  YOUTUBE_OAUTH_REDIRECT,
  YOUTUBE_VIDEO_CAP,
  analyticsReportUrl,
  metricUnsupported,
  parseChannelDays,
  parseChannelPayload,
  parseVideoRows,
  readTokenField,
  type ParsedChannelDay,
  type YouTubeVideoMetric,
} from "@/lib/youtube-analytics";
import type { YouTubeClientConfig } from "@/lib/youtube-oauth";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

let fetchImpl: FetchLike | null = null;

export function setYouTubeFetchForTests(next: FetchLike | null) {
  fetchImpl = next;
}

function ytFetch(input: string, init?: RequestInit): Promise<Response> {
  const run = fetchImpl ?? fetch;
  return run(input, init);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function exchangeAuthCode(input: {
  code: string;
  config: YouTubeClientConfig;
  redirectUri?: string;
}): Promise<{ accessToken: string | null; refreshToken: string | null } | null> {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.config.clientId,
    client_secret: input.config.clientSecret,
    redirect_uri: input.redirectUri ?? YOUTUBE_OAUTH_REDIRECT,
    grant_type: "authorization_code",
  });
  const response = await ytFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
  });
  const json = await readJson(response);
  if (!response.ok) return null;
  return {
    accessToken: readTokenField(json, "access_token"),
    refreshToken: readTokenField(json, "refresh_token"),
  };
}

export async function refreshAccessToken(
  config: YouTubeClientConfig,
  refreshToken: string,
): Promise<string | null> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await ytFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
  });
  const json = await readJson(response);
  if (!response.ok) return null;
  return readTokenField(json, "access_token");
}

async function getJson(url: string, accessToken: string): Promise<{ status: number; json: unknown }> {
  const response = await ytFetch(url, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  return { status: response.status, json: await readJson(response) };
}

export async function fetchYouTubeChannel(accessToken: string) {
  const { status, json } = await getJson(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
    accessToken,
  );
  if (status !== 200) return null;
  return parseChannelPayload(json);
}

export async function fetchChannelDays(
  accessToken: string,
  start: string,
  end: string,
): Promise<ParsedChannelDay[] | null> {
  const { status, json } = await getJson(
    analyticsReportUrl({
      start,
      end,
      metrics: CHANNEL_METRICS,
      dimensions: "day",
    }),
    accessToken,
  );
  if (status !== 200) return null;
  return parseChannelDays(json);
}

export async function fetchVideoMetrics(
  accessToken: string,
  start: string,
  end: string,
): Promise<YouTubeVideoMetric[] | null> {
  const first = await getJson(
    analyticsReportUrl({
      start,
      end,
      metrics: VIDEO_METRICS,
      dimensions: "video",
      maxResults: YOUTUBE_VIDEO_CAP,
      sort: "-views",
    }),
    accessToken,
  );
  if (first.status === 200) return parseVideoRows(first.json);
  if (first.status === 400 && metricUnsupported(first.json)) {
    const second = await getJson(
      analyticsReportUrl({
        start,
        end,
        metrics: VIDEO_METRICS_CORE,
        dimensions: "video",
        maxResults: YOUTUBE_VIDEO_CAP,
        sort: "-views",
      }),
      accessToken,
    );
    if (second.status !== 200) return null;
    return parseVideoRows(second.json);
  }
  return null;
}

export async function fetchVideoTitles(
  accessToken: string,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  const list = ids.slice(0, YOUTUBE_VIDEO_CAP);
  if (list.length === 0) return titles;
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(list.join(","))}&maxResults=${YOUTUBE_VIDEO_CAP}`;
  const { status, json } = await getJson(url, accessToken);
  if (status !== 200 || !json || typeof json !== "object") return titles;
  const items = (json as { items?: unknown }).items;
  if (!Array.isArray(items)) return titles;
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { id?: unknown }).id;
    const title = (item as { snippet?: { title?: unknown } }).snippet?.title;
    if (typeof id === "string" && typeof title === "string" && title.trim()) {
      titles.set(id, title.trim().slice(0, 180));
    }
  }
  return titles;
}
