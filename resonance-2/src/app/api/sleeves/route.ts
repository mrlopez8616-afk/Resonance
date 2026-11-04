import { NextResponse } from "next/server";
import { authorizeReadRequest, finishAuthorizedRead } from "@/lib/auth-read";
import { privateModeResponse, requestIsPublicMode } from "@/lib/public-mode-server";
import { asFillWriteError, liveSleevesFromEnvelope, loadFillsStore } from "@/lib/fills-store";
import { seedBookForTicker } from "@/lib/sleeve-apply";
import { storageErrorJson } from "@/lib/storage-unavailable";
import { overlayStoredBrokerBooks, readBrokerSyncView } from "@/lib/broker-sync-store";
import { tickerSyncLine, tickerSyncStale } from "@/lib/broker-sync";
import { hasMoneyText } from "@/lib/public-mode";
import { withSuiCoinbaseBalance } from "@/lib/sui-coinbase-balance";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await authorizeReadRequest(request);
  if (!access.ok) return access.response;
  if (await requestIsPublicMode(request)) return privateModeResponse();
  const ticker = (
    new URL(request.url).searchParams.get("ticker") ?? ""
  ).trim().toUpperCase();
  const seed = seedBookForTicker(ticker);
  if (!seed) {
    return finishAuthorizedRead(
      NextResponse.json(
        { ok: false, error: "No live sleeve book for that ticker." },
        { status: 404, headers: { "cache-control": "no-store" } },
      ),
      access,
    );
  }

  try {
    const loaded = await loadFillsStore();
    const printed = liveSleevesFromEnvelope(loaded.envelope, ticker) ?? [...seed];
    const stored = await overlayStoredBrokerBooks({ [ticker]: printed });
    const brokered = stored[ticker] ?? printed;
    const live = ticker === "SUI" ? await withSuiCoinbaseBalance(brokered) : null;
    const syncView = await readBrokerSyncView(new Date());
    const syncLine = tickerSyncLine(ticker, syncView);
    const sync =
      syncLine && !hasMoneyText(syncLine)
        ? { line: syncLine, stale: tickerSyncStale(ticker, syncView) }
        : null;
    return finishAuthorizedRead(
      NextResponse.json(
        {
          ok: true,
          ticker,
          configured: loaded.configured,
          backend: loaded.backend,
          updatedAt: loaded.envelope.updatedAt,
          sleeves: live?.sleeves ?? brokered,
          ...(live ? { balance: { fresh: live.fresh, asOf: live.asOf } } : {}),
          ...(sync ? { sync } : {}),
        },
        { headers: { "cache-control": "no-store" } },
      ),
      access,
    );
  } catch (error) {
    const mapped = asFillWriteError(error);
    return finishAuthorizedRead(
      NextResponse.json(storageErrorJson(mapped), {
        status: mapped.status,
        headers: { "cache-control": "no-store" },
      }),
      access,
    );
  }
}
