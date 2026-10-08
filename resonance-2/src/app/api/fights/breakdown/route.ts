import { NextResponse } from "next/server";
import { breakdownsForEvent, parseBreakdownBody } from "@/lib/fight-breakdowns";
import {
  asBreakdownWriteError,
  isFightBreakdownsStoreConfigured,
  loadFightBreakdownsStore,
  postFightBreakdowns,
} from "@/lib/fight-breakdowns-store";
import { authorizeReadRequest, finishAuthorizedRead } from "@/lib/auth-read";
import { storageErrorJson } from "@/lib/storage-unavailable";
import { authorizeSyncRequest } from "@/lib/sync-auth";

export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

function unauthorized(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 401 });
}

function notConfigured() {
  return NextResponse.json(
    {
      ok: false,
      configured: false,
      error:
        "Fight breakdown store is not configured. In Vercel: Storage → Blob → connect resonance3 → redeploy.",
    },
    { status: 503 },
  );
}

/**
 * One event's breakdowns. Session or hub Bearer.
 * Fight Desk posts site_analysis.json as the body (eventSlug + fights).
 * Add `data` (the data.json array) on that object to store per-side stats and books.
 * `{breakdowns:[...]}` and a bare camelCase array are the same write.
 */
export async function GET(request: Request) {
  const access = await authorizeReadRequest(request);
  if (!access.ok) return access.response;
  const event = new URL(request.url).searchParams.get("event")?.trim() ?? "";
  if (!SLUG.test(event)) {
    return finishAuthorizedRead(
      NextResponse.json({ ok: false, error: "event must be a lowercase slug." }, { status: 400 }),
      access,
    );
  }
  try {
    const loaded = await loadFightBreakdownsStore();
    return finishAuthorizedRead(
      NextResponse.json({
        ok: true,
        configured: loaded.configured,
        backend: loaded.backend,
        event,
        breakdowns: breakdownsForEvent(loaded.envelope.breakdowns, event),
        updatedAt: loaded.envelope.updatedAt,
      }),
      access,
    );
  } catch (error) {
    const mapped = asBreakdownWriteError(error);
    console.error("breakdown read failed", mapped.message);
    return finishAuthorizedRead(
      NextResponse.json(storageErrorJson(mapped), { status: mapped.status }),
      access,
    );
  }
}

/** Upsert breakdowns. Auth is the same Bearer as POST /api/bets. */
export async function POST(request: Request) {
  const auth = authorizeSyncRequest(request);
  if (!auth.ok) return unauthorized(auth.error);
  if (!isFightBreakdownsStoreConfigured()) return notConfigured();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON body is required." }, { status: 400 });
  }

  try {
    const written = await postFightBreakdowns(parseBreakdownBody(body));
    return NextResponse.json({
      ok: true,
      backend: written.backend,
      deduped: written.results.every((row) => row.deduped),
      results: written.results,
      updatedAt: written.envelope.updatedAt,
    });
  } catch (error) {
    const mapped = asBreakdownWriteError(error);
    console.error("breakdown post failed", mapped.message);
    return NextResponse.json(storageErrorJson(mapped), { status: mapped.status });
  }
}
