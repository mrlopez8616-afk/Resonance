import { fetchEquityUsd, isEquityTicker } from "@/lib/equity-price";
import { fetchSpotUsd, isSpotTicker } from "@/lib/spot-price";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ticker = (
    new URL(request.url).searchParams.get("ticker") ?? ""
  )
    .trim()
    .toUpperCase();
  if (!isSpotTicker(ticker) && !isEquityTicker(ticker)) {
    return Response.json(
      {
        usd: null,
        source: null,
        fetchedAt: null,
        error: "Unknown spot ticker",
      },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const quote = isEquityTicker(ticker)
      ? await fetchEquityUsd(ticker)
      : await fetchSpotUsd(ticker);
    return Response.json(quote, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `${ticker}-USD fetch failed`;
    return Response.json(
      { usd: null, source: null, fetchedAt: null, error: message },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
