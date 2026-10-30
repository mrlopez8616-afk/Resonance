import { NextResponse } from "next/server";
import { runScheduledYouTubePull } from "@/lib/youtube-pull";
import { youtubeSlotForSchedule } from "@/lib/youtube-analytics";
import { authorizeBackupAccess, getCronSecret, getSyncSecret, readBearerToken } from "@/lib/sync-auth-core";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

async function handle(request: Request) {
  const auth = authorizeBackupAccess({
    cronSecret: getCronSecret(),
    syncSecret: getSyncSecret(),
    bearer: readBearerToken(request.headers.get("authorization")),
  });
  if (!auth.ok) return json({ ok: false, error: auth.error }, 401);
  if (!process.env.DATABASE_URL?.trim()) {
    return json({ ok: false, error: "Postgres is not configured." }, 503);
  }
  const slot = youtubeSlotForSchedule(request.headers.get("x-vercel-cron-schedule"));
  try {
    const result = await runScheduledYouTubePull({ slot });
    const status = result.status === "error" ? 500 : 200;
    return json({ ok: result.ok, status: result.status, slot, message: result.message }, status);
  } catch {
    console.error("youtube pull failed");
    return json({ ok: false, error: "YouTube pull failed." }, 500);
  }
}

/** Vercel Cron calls GET. Three daily schedules share this path. */
export async function GET(request: Request) {
  return handle(request);
}

/** Manual run with the same Bearer. */
export async function POST(request: Request) {
  return handle(request);
}
