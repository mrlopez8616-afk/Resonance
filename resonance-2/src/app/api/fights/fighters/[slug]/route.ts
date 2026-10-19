import { NextResponse } from "next/server";
import { authorizeReadRequest, finishAuthorizedRead } from "@/lib/auth-read";
import { appendSettledResults, careerRecord, careerTrends, NOT_RECORDED } from "@/lib/fighter-careers";
import { readFighterCareer } from "@/lib/fighter-careers-store";
import { privateModeResponse, requestIsPublicMode } from "@/lib/public-mode-server";
import { isStorageUnavailable, storageErrorJson } from "@/lib/storage-unavailable";
import { loadBreakdownsForPage, loadCalendarForPage, loadFightResultsForPage } from "@/lib/store-page";

export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

/**
 * One fighter career. Session or hub Bearer.
 * A settled fight result is included when its date is already known. Stats stay empty until posted.
 */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const access = await authorizeReadRequest(request);
  if (!access.ok) return access.response;
  if (await requestIsPublicMode(request)) return privateModeResponse();
  const { slug } = await context.params;
  if (!SLUG.test(slug)) {
    return finishAuthorizedRead(json(400, { ok: false, error: "slug must be a lowercase slug." }), access);
  }
  if (!process.env.DATABASE_URL?.trim()) {
    return finishAuthorizedRead(
      json(503, { ok: false, configured: false, error: "Postgres is not configured." }),
      access,
    );
  }
  try {
    const loaded = await readFighterCareer(slug);
    if (!loaded) {
      return finishAuthorizedRead(json(404, { ok: false, error: "Fighter not found." }), access);
    }
    const [resultsPage, calendar, breakdowns] = await Promise.all([
      loadFightResultsForPage(),
      loadCalendarForPage(),
      loadBreakdownsForPage(),
    ]);
    const results = resultsPage.status === "unavailable" ? [] : resultsPage.results;
    const rows = breakdowns.status === "unavailable" ? [] : breakdowns.breakdowns;
    const fights = appendSettledResults(loaded.fights, {
      slug,
      results,
      events: calendar.events,
      boutDates: rows.flatMap((row) =>
        row.slot && /^\d{4}-\d{2}-\d{2}$/.test(row.slot)
          ? [{ event: row.eventSlug, fightSlug: row.fightSlug, date: row.slot }]
          : [],
      ),
    });
    const trends = careerTrends(fights);
    return finishAuthorizedRead(
      json(200, {
        ok: true,
        configured: true,
        fighter: loaded.fighter,
        record: careerRecord(fights),
        fights,
        trends,
        empty: NOT_RECORDED,
      }),
      access,
    );
  } catch (error) {
    if (isStorageUnavailable(error)) {
      return finishAuthorizedRead(
        NextResponse.json(storageErrorJson(error), { status: 503, headers: { "cache-control": "no-store" } }),
        access,
      );
    }
    console.error("fighter career read failed", error instanceof Error ? error.message : "unknown");
    return finishAuthorizedRead(json(500, { ok: false, error: "Fighter career is unavailable." }), access);
  }
}
