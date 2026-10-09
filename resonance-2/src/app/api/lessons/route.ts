import { NextResponse } from "next/server";
import { authorizeReadRequest, finishAuthorizedRead } from "@/lib/auth-read";
import { loadLessonsPayload, patchLesson, writeLessons } from "@/lib/lessons-store";
import { authorizeSyncRequest } from "@/lib/sync-auth";
import { isStorageUnavailable, storageErrorJson } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

function unauthorized(error: string) {
  return NextResponse.json(
    { ok: false, error },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

function storedError(error: unknown) {
  if (isStorageUnavailable(error)) {
    return NextResponse.json(storageErrorJson(error), {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
  console.error("lessons failed", error instanceof Error ? error.message : "unknown");
  return NextResponse.json(
    { ok: false, error: "Lessons are unavailable." },
    { status: 500, headers: { "cache-control": "no-store" } },
  );
}

/** Lesson list, newest first. Owner session or hub Bearer. Public mode drops private rows, dollar amounts, and sources. */
export async function GET(request: Request) {
  const access = await authorizeReadRequest(request);
  if (!access.ok) return access.response;
  try {
    return finishAuthorizedRead(
      NextResponse.json(await loadLessonsPayload(), {
        headers: { "cache-control": "no-store" },
      }),
      access,
    );
  } catch (error) {
    return storedError(error);
  }
}

/** Upsert by id. One object, an array, or `{ lessons: [...] }`. Sync Bearer only. */
export async function POST(request: Request) {
  const auth = authorizeSyncRequest(request);
  if (!auth.ok) return unauthorized(auth.error);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON body is required." }, { status: 400 });
  }
  try {
    const written = await writeLessons(body);
    if (!written.ok) {
      return NextResponse.json(
        { ok: false, error: written.error },
        { status: written.status, headers: { "cache-control": "no-store" } },
      );
    }
    if (written.many) {
      return NextResponse.json(
        { ok: true, upserted: written.upserted, lessons: written.lessons },
        { headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: true, lesson: written.lesson },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return storedError(error);
  }
}

/** Change one lesson by id. Sync Bearer only. A session cookie cannot write. */
export async function PATCH(request: Request) {
  const auth = authorizeSyncRequest(request);
  if (!auth.ok) return unauthorized(auth.error);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON body is required." }, { status: 400 });
  }
  try {
    const written = await patchLesson(body);
    if (!written.ok) {
      return NextResponse.json(
        { ok: false, error: written.error },
        { status: written.status, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: true, lesson: written.lesson },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return storedError(error);
  }
}
