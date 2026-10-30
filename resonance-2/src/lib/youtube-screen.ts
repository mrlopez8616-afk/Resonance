import "server-only";

import { sqlQuery } from "@/lib/pg/client";
import { isPublicMode } from "@/lib/public-mode-server";
import { SKIPPED_HEALTH_CHECK, formatCount, presentYouTubeScreen, type YouTubeScreen } from "@/lib/youtube-analytics";
import { loadYouTubeAnalytics } from "@/lib/youtube-analytics-store";
import { youtubeClientConfig } from "@/lib/youtube-oauth";
import { youtubeHomeLines } from "@/lib/youtube-node";

/** Null in Public view, so private analytics are not loaded into that render. */
export async function loadYouTubeScreen(denied = false): Promise<YouTubeScreen | null> {
  if (await isPublicMode()) return null;
  const model = await loadYouTubeAnalytics();
  return presentYouTubeScreen(model, {
    publicMode: false,
    connectReady: youtubeClientConfig() !== null,
    denied,
  });
}

/** One short status line for the home tile. Does not load the video table. */
export async function loadYouTubeHomeLines(): Promise<readonly string[] | null> {
  if (await isPublicMode()) return null;
  const [pulls, accounts] = await Promise.all([
    sqlQuery<{ status: string; message: string }>(
      `SELECT status, message FROM youtube_pulls ORDER BY started_at DESC, id DESC LIMIT 1`,
    ),
    sqlQuery<{ subscriber_count: unknown }>(`SELECT subscriber_count FROM youtube_oauth WHERE id = 1`),
  ]);
  const last = pulls[0];
  if (last?.message === SKIPPED_HEALTH_CHECK) {
    return youtubeHomeLines(undefined, `Channel · ${SKIPPED_HEALTH_CHECK}`);
  }
  if (last?.status === "error" && last.message === "pull failed") {
    return youtubeHomeLines(undefined, "Channel · pull failed");
  }
  if (!accounts[0]) return null;
  const subscribers = typeof accounts[0].subscriber_count === "number" || typeof accounts[0].subscriber_count === "string"
    ? Number(accounts[0].subscriber_count)
    : null;
  if (subscribers === null || !Number.isFinite(subscribers) || subscribers < 0) {
    return youtubeHomeLines(undefined, "Channel · not recorded");
  }
  return youtubeHomeLines(undefined, `Channel · ${formatCount(subscribers)} subs`);
}
