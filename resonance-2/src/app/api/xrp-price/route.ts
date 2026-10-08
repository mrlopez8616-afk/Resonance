import { authorizeReadRequest, finishAuthorizedRead } from "@/lib/auth-read";
import { fetchSpotUsd } from "@/lib/spot-price";

export const dynamic = "force-dynamic";

/** Kept for the first XRP brick. New faces use `/api/spot-price?ticker=`. */
export async function GET(request: Request) {
  const access = await authorizeReadRequest(request);
  if (!access.ok) return access.response;
  try {
    const quote = await fetchSpotUsd("XRP");
    return finishAuthorizedRead(
      Response.json(quote, {
        headers: { "cache-control": "no-store" },
      }),
      access,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "XRP-USD fetch failed";
    return finishAuthorizedRead(
      Response.json(
        { usd: null, source: null, fetchedAt: null, error: message },
        { status: 502, headers: { "cache-control": "no-store" } },
      ),
      access,
    );
  }
}
