import { NextResponse } from "next/server";
import { authorizeReadRequest, finishAuthorizedRead } from "@/lib/auth-read";
import { loadBuildItems, createBuildItem, patchBuildItem, boardJson } from "@/lib/build-store";
import { groupBuildItems } from "@/lib/build-tracker";
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
  console.error("build items failed", error instanceof Error ? error.message : "unknown");
  return NextResponse.json(
    { ok: false, error: "Build tracker is unavailable." },
    { status: 500, headers: { "cache-control": "no-store" } },
  );
}

/** Item list. Owner session or hub Bearer. Percents come from stored steps. */
export async function GET(request: Request) {
  const access = await authorizeReadRequest(request);
  if (!access.ok) return access.response;
  try {
    const now = new Date();
    const loaded = await loadBuildItems();
    const grouped = groupBuildItems(loaded.items, now);
    return finishAuthorizedRead(
      NextResponse.json(boardJson({ ...grouped, githubFresh: loaded.githubFresh }, loaded.items, now), {
        headers: { "cache-control": "no-store" },
      }),
      access,
    );
  } catch (error) {
    return storedError(error);
  }
}

/** Add an item. Sync Bearer only. A session cookie cannot write. */
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
    const written = await createBuildItem(body);
    if (!written.ok) {
      return NextResponse.json(
        { ok: false, error: written.error },
        { status: written.status, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: true, item: written.item },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return storedError(error);
  }
}

/** Update next step, status, or a checklist step. Sync Bearer only. */
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
    const written = await patchBuildItem(body);
    if (!written.ok) {
      return NextResponse.json(
        { ok: false, error: written.error },
        { status: written.status, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: true, item: written.item },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return storedError(error);
  }
}
