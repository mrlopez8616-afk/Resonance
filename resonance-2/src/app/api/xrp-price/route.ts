import { fetchXrpUsd } from "@/lib/xrp-price";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const quote = await fetchXrpUsd();
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
