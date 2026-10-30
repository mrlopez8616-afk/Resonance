import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-session";
import { requestIsPublicMode } from "@/lib/public-mode-server";
import { sealYouTubeState, youtubeAuthUrl, youtubeClientConfig, YOUTUBE_OAUTH_STATE_COOKIE } from "@/lib/youtube-oauth";

export const dynamic = "force-dynamic";

const PRIVATE = { "cache-control": "no-store" };

function json(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status, headers: PRIVATE });
}

/** Owner only. Sends the browser to Google. The refresh token is stored later, on the callback. */
export async function GET(request: Request) {
  const access = await requireRole("owner", request);
  if (access instanceof NextResponse) return access;
  if (await requestIsPublicMode(request)) return json(404, "Private.");
  const config = youtubeClientConfig();
  const secret = process.env.AUTH_SESSION_SECRET?.trim() ?? "";
  if (!config || !secret) return json(503, "YouTube sign-in is not configured.");
  const state = sealYouTubeState(secret, Date.now());
  const response = NextResponse.redirect(youtubeAuthUrl({ clientId: config.clientId, state }));
  response.cookies.set({
    name: YOUTUBE_OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
