import { fetchSpotUsd } from "@/lib/spot-price";

export const dynamic = "force-dynamic";

/** Kept for the first XRP brick. New faces use `/api/spot-price?ticker=`. */
export async function GET() {
  try {
    const quote = await fetchSpotUsd("XRP");
    return Response.json(quote, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "XRP-USD fetch failed";
    return Response.json(
      { usd: null, source: null, fetchedAt: null, error: message },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
