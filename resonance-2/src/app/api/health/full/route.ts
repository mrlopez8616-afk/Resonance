import { NextResponse } from "next/server";
import { authorizeHealthRequest } from "@/lib/health-auth";
import { loadHealthFull } from "@/lib/health-full-load";
import { publicHealthReport } from "@/lib/health-report";

export const dynamic = "force-dynamic";

const PRIVATE = { "cache-control": "no-store" };

/**
 * Read-only floor probe. `Authorization: Bearer $RESONANCE_HEALTH_TOKEN`.
 * The sync secret is not accepted. There is no write handler.
 */
export async function GET(request: Request) {
  if (!authorizeHealthRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401, headers: PRIVATE });
  }
  try {
    const report = publicHealthReport(await loadHealthFull());
    return NextResponse.json(report, { headers: PRIVATE });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Health check failed." },
      { status: 500, headers: PRIVATE },
    );
  }
}
