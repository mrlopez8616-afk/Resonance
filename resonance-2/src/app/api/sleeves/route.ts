import { NextResponse } from "next/server";
import { liveSleevesFromEnvelope, loadFillsStore } from "@/lib/fills-store";
import { seedBookForTicker } from "@/lib/sleeve-apply";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ticker = (
    new URL(request.url).searchParams.get("ticker") ?? ""
  ).trim().toUpperCase();
  const seed = seedBookForTicker(ticker);
  if (!seed) {
    return NextResponse.json(
      { ok: false, error: "No live sleeve book for that ticker." },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const loaded = await loadFillsStore();
    const sleeves = liveSleevesFromEnvelope(loaded.envelope, ticker) ?? [...seed];
    return NextResponse.json(
      {
        ok: true,
        ticker,
        configured: loaded.configured,
        backend: loaded.backend,
        updatedAt: loaded.envelope.updatedAt,
        sleeves,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: true,
        ticker,
        configured: false,
        backend: "none",
        sleeves: [...seed],
        error: error instanceof Error ? error.message : "Sleeve store unavailable.",
      },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
