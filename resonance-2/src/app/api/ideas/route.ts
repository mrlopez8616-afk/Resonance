import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/auth-core";
import { authorizeReadRequest, finishAuthorizedRead } from "@/lib/auth-read";
import { requireRole } from "@/lib/auth-session";
import { createIdea, ideaJsonList, patchIdea, readIdeas } from "@/lib/future-ideas-store";
import { privateModeResponse, requestIsPublicMode } from "@/lib/public-mode-server";
import { isStorageUnavailable, storageErrorJson } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

function storedError(error: unknown) {
  if (isStorageUnavailable(error)) {
    return NextResponse.json(storageErrorJson(error), {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
  console.error("future ideas failed", error instanceof Error ? error.message : "unknown");
  return json(500, { ok: false, error: "Future Ideas is unavailable." });
}

async function readBody(request: Request) {
  try {
    return { ok: true as const, body: await request.json() };
  } catch {
    return { ok: false as const, response: json(400, { ok: false, error: "JSON body is required." }) };
  }
}

/**
 * Idea list. Owner session or hub Bearer.
 * Public mode drops archived rows and dollar amounts. It does not move money.
 */
export async function GET(request: Request) {
  const access = await authorizeReadRequest(request);
  if (!access.ok) return access.response;
  try {
    const publicMode = await requestIsPublicMode(request);
    const ideas = ideaJsonList(await readIdeas(), publicMode);
    return finishAuthorizedRead(
      NextResponse.json(
        { ok: true, public: publicMode, count: ideas.length, ideas },
        { headers: { "cache-control": "no-store" } },
      ),
      access,
    );
  } catch (error) {
    return storedError(error);
  }
}

async function ownerWrite(request: Request) {
  if (request.headers.get("authorization")) {
    return json(401, { ok: false, error: "Unauthorized." });
  }
  const gate = await requireRole("owner", request);
  if (gate instanceof NextResponse) return gate;
  if (!isSameOriginRequest(request)) return json(403, { ok: false, error: "Forbidden." });
  if (await requestIsPublicMode(request)) return privateModeResponse();
  return null;
}

/** Add one idea. Owner session, same origin. A Bearer token cannot write. */
export async function POST(request: Request) {
  const denied = await ownerWrite(request);
  if (denied) return denied;
  const body = await readBody(request);
  if (!body.ok) return body.response;
  try {
    const written = await createIdea(body.body);
    if (!written.ok) return json(written.status, { ok: false, error: written.error });
    return json(200, { ok: true, idea: written.idea });
  } catch (error) {
    return storedError(error);
  }
}

/** Edit or archive one idea. Owner session, same origin. Omitted fields stay as stored. */
export async function PATCH(request: Request) {
  const denied = await ownerWrite(request);
  if (denied) return denied;
  const body = await readBody(request);
  if (!body.ok) return body.response;
  try {
    const written = await patchIdea(body.body);
    if (!written.ok) return json(written.status, { ok: false, error: written.error });
    return json(200, { ok: true, idea: written.idea });
  } catch (error) {
    return storedError(error);
  }
}
