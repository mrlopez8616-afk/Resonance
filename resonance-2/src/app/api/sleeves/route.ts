import { NextResponse } from "next/server";
import { asFillWriteError, liveSleevesFromEnvelope, loadFillsStore } from "@/lib/fills-store";
import { seedBookForTicker } from "@/lib/sleeve-apply";
import { storageErrorJson } from "@/lib/storage-unavailable";

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
    const mapped = asFillWriteError(error);
    return NextResponse.json(storageErrorJson(mapped), {
      status: mapped.status,
      headers: { "cache-control": "no-store" },
    });
  }
}
