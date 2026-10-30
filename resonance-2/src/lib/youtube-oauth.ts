import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { YOUTUBE_OAUTH_REDIRECT, YOUTUBE_SCOPES } from "@/lib/youtube-analytics";

export const YOUTUBE_OAUTH_STATE_COOKIE = "__Host-yt_oauth";
const STATE_TTL_MS = 10 * 60 * 1000;

export type YouTubeClientConfig = {
  clientId: string;
  clientSecret: string;
};

export function youtubeClientConfig(
  env: Record<string, string | undefined> = process.env,
): YouTubeClientConfig | null {
  const clientId = env.GOOGLE_YT_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.GOOGLE_YT_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function youtubeAuthUrl(input: { clientId: string; state: string; redirectUri?: string }): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri ?? YOUTUBE_OAUTH_REDIRECT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", YOUTUBE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", input.state);
  return url.toString();
}

export function sealYouTubeState(secret: string, now: number, nonce = randomBytes(16).toString("base64url")): string {
  const body = Buffer.from(JSON.stringify({ n: nonce, exp: now + STATE_TTL_MS })).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function openYouTubeState(token: string | null | undefined, secret: string, now: number): boolean {
  if (!token || !secret) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as { exp?: unknown };
    return typeof parsed.exp === "number" && parsed.exp > now;
  } catch {
    return false;
  }
}

export function statesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
