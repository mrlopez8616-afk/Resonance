import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Retired. FITNESS_INGEST_TOKEN, revealed on Settings -> Security, is the
 * fitness sync token. This route no longer mints or stores a token.
 * The response has no token value. The request body is not read or logged.
 */
export async function POST(request: Request) {
  // Retired. The body and headers are not read, so a token cannot be logged.
  void request.method;
  return NextResponse.json(
    { ok: false, error: "Use Settings -> Security -> Fitness sync token." },
    {
      status: 410,
      headers: { "cache-control": "no-store" },
    },
  );
}
