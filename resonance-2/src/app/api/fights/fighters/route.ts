import { NextResponse } from "next/server";
import { FighterCareerError, parseFighterCareer } from "@/lib/fighter-careers";
import { upsertFighterCareer } from "@/lib/fighter-careers-store";
import { authorizeSyncRequest } from "@/lib/sync-auth";
import { isStorageUnavailable, storageErrorJson } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

/**
 * Upsert one fighter and that fighter's UFC fights.
 * Sync Bearer, same as POST /api/bets.
 * The same date and opponent updates the stored row and does not add another.
 */
export async function POST(request: Request) {
  const auth = authorizeSyncRequest(request);
  if (!auth.ok) return json(401, { ok: false, error: auth.error });
  if (!process.env.DATABASE_URL?.trim()) {
    return json(503, { ok: false, configured: false, error: "Postgres is not configured." });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "JSON body is required." });
  }
  try {
    const written = await upsertFighterCareer(parseFighterCareer(body));
    return json(200, {
      ok: true,
      deduped: written.deduped,
      fighter: written.fighter,
      fights: written.fights,
    });
  } catch (error) {
    if (error instanceof FighterCareerError) {
      return json(error.status, { ok: false, error: error.message });
    }
    if (isStorageUnavailable(error)) {
      return NextResponse.json(storageErrorJson(error), {
        status: 503,
        headers: { "cache-control": "no-store" },
      });
    }
    console.error("fighter career post failed", error instanceof Error ? error.message : "unknown");
    return json(500, { ok: false, error: "Fighter career is unavailable." });
  }
}
