import { NextResponse } from "next/server";
import { SESSION_COOKIE, isLoginConfigured, isSessionToken, readCookieValue } from "@/lib/auth-core";
import { finishAuthorizedRead } from "@/lib/auth-read";
import { readLiveSession } from "@/lib/auth-store";
import { requestIsPublicMode } from "@/lib/public-mode-server";
import { authorizeSyncRequest } from "@/lib/sync-auth";
import { isStorageUnavailable, storageErrorJson } from "@/lib/storage-unavailable";
import { loadBrickRows, saveBrickEpisode } from "@/lib/youtube-bricks-store";
import { parseBrickPatch, parseBrickPost, toBrickJson } from "@/lib/youtube-bricks";

export const dynamic = "force-dynamic";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

function unauthorized(error = "Unauthorized.") {
  return json(401, { ok: false, error });
}

function storedError(error: unknown) {
  if (isStorageUnavailable(error)) {
    return NextResponse.json(storageErrorJson(error), {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
  console.error("youtube bricks failed", error instanceof Error ? error.message : "unknown");
  return json(500, { ok: false, error: "Brick Tracker is unavailable." });
}

/** Owner session only. A Bearer token does not read this list. */
async function ownerSession(request: Request) {
  if (!isLoginConfigured()) return { ok: false as const, response: unauthorized() };
  const token = readCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (!token || !isSessionToken(token)) return { ok: false as const, response: unauthorized() };
  try {
    const live = await readLiveSession(token);
    if (!live || live.session.role !== "owner") return { ok: false as const, response: unauthorized() };
    return { ok: true as const, resetCookie: live.resetCookie, token: live.token };
  } catch (error) {
    if (isStorageUnavailable(error)) return { ok: false as const, response: unauthorized() };
    throw error;
  }
}

function episodeJson(episode: {
  brickId: string;
  status: string;
  videoUrl: string | null;
  note: string | null;
  updatedAt: string;
}) {
  return {
    brick_id: episode.brickId,
    status: episode.status,
    video_url: episode.videoUrl,
    note: episode.note,
    updated_at: episode.updatedAt,
  };
}

/** Episode list. Owner session. Public mode drops private lessons, dollar amounts, and secrets. */
export async function GET(request: Request) {
  const access = await ownerSession(request);
  if (!access.ok) return access.response;
  try {
    const publicMode = await requestIsPublicMode(request);
    const rows = await loadBrickRows(publicMode);
    return finishAuthorizedRead(
      NextResponse.json(
        { ok: true, public: publicMode, count: rows.length, bricks: rows.map(toBrickJson) },
        { headers: { "cache-control": "no-store" } },
      ),
      { ok: true, via: "session", resetCookie: access.resetCookie, token: access.token },
    );
  } catch (error) {
    return storedError(error);
  }
}

async function readBody(request: Request) {
  try {
    return { ok: true as const, body: await request.json() };
  } catch {
    return { ok: false as const, response: json(400, { ok: false, error: "JSON body is required." }) };
  }
}

/** Set status for one brick. Bearer only. A session cookie cannot write. */
export async function POST(request: Request) {
  const auth = authorizeSyncRequest(request);
  if (!auth.ok) return unauthorized(auth.error);
  const body = await readBody(request);
  if (!body.ok) return body.response;
  const parsed = parseBrickPost(body.body);
  if (!parsed.ok) return json(parsed.status, { ok: false, error: parsed.error });
  try {
    const saved = await saveBrickEpisode(parsed.value);
    if (!saved.ok) return json(saved.status, { ok: false, error: saved.error });
    return json(200, { ok: true, episode: episodeJson(saved.episode) });
  } catch (error) {
    return storedError(error);
  }
}

/** Change status, video URL, or note. Bearer only. Omitted fields stay as stored. */
export async function PATCH(request: Request) {
  const auth = authorizeSyncRequest(request);
  if (!auth.ok) return unauthorized(auth.error);
  const body = await readBody(request);
  if (!body.ok) return body.response;
  const parsed = parseBrickPatch(body.body);
  if (!parsed.ok) return json(parsed.status, { ok: false, error: parsed.error });
  try {
    const saved = await saveBrickEpisode(parsed.value);
    if (!saved.ok) return json(saved.status, { ok: false, error: saved.error });
    return json(200, { ok: true, episode: episodeJson(saved.episode) });
  } catch (error) {
    return storedError(error);
  }
}
