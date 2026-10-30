import { NextResponse } from "next/server";
import { readCookieValue } from "@/lib/auth-core";
import { requireRole } from "@/lib/auth-session";
import { requestIsPublicMode } from "@/lib/public-mode-server";
import { exchangeAuthCode, fetchYouTubeChannel } from "@/lib/youtube-google";
import { readYouTubeRefreshToken, saveYouTubeConnection } from "@/lib/youtube-analytics-store";
import {
  openYouTubeState,
  statesMatch,
  youtubeClientConfig,
  YOUTUBE_OAUTH_STATE_COOKIE,
} from "@/lib/youtube-oauth";

export const dynamic = "force-dynamic";

const PRIVATE = { "cache-control": "no-store" };

function json(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status, headers: PRIVATE });
}

function clearState(response: NextResponse) {
  response.cookies.set({
    name: YOUTUBE_OAUTH_STATE_COOKIE,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

function done(kind: "connected" | "denied") {
  const url = new URL("https://resonance3.vercel.app/n/youtube");
  if (kind === "denied") url.searchParams.set("youtube", "denied");
  return clearState(NextResponse.redirect(url));
}

/** Google returns here. The refresh token is written to Postgres and is not put on the redirect. */
export async function GET(request: Request) {
  const access = await requireRole("owner", request);
  if (access instanceof NextResponse) return access;
  if (await requestIsPublicMode(request)) return json(404, "Private.");
  const config = youtubeClientConfig();
  const secret = process.env.AUTH_SESSION_SECRET?.trim() ?? "";
  if (!config || !secret) return json(503, "YouTube sign-in is not configured.");

  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";
  const cookieState = readCookieValue(request.headers.get("cookie"), YOUTUBE_OAUTH_STATE_COOKIE);
  if (
    url.searchParams.get("error") ||
    !code ||
    !state ||
    !cookieState ||
    !statesMatch(state, cookieState) ||
    !openYouTubeState(state, secret, Date.now())
  ) {
    return done("denied");
  }

  try {
    const tokens = await exchangeAuthCode({ code, config });
    const refreshToken = tokens?.refreshToken ?? (await readYouTubeRefreshToken());
    if (!tokens || !refreshToken) return done("denied");
    const channel = tokens.accessToken ? await fetchYouTubeChannel(tokens.accessToken) : null;
    await saveYouTubeConnection({
      refreshToken,
      channelId: channel?.id ?? null,
      channelTitle: channel?.title || null,
      subscribers: channel?.subscribers ?? null,
      videoCount: channel?.videoCount ?? null,
    });
    return done("connected");
  } catch {
    console.error("youtube oauth callback failed");
    return done("denied");
  }
}
