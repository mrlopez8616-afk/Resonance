import "server-only";

import { AI_STOCK_TICKERS } from "@/lib/ai-stocks";
import { yahooSessionDay } from "@/lib/equity-chart";
import { loadOperatorFloor } from "@/lib/operator-floor";
import {
  assembleNodePosition,
  type FillMarker,
} from "@/lib/position-lots";
import { loadCryptoCloses, loadEquityCloses } from "@/lib/price-history";
import {
  firstBuyPriceFromMarkers,
  toPublicFloor,
  type DailyValue,
  type PublicFloorModel,
  type PublicHoldingInput,
} from "@/lib/public-mode";
import { loadOperatorFills } from "@/lib/sleeve-prints";

const EQUITIES = AI_STOCK_TICKERS;

function dailyFromPosition(
  points: readonly { day: string; valueUsd: number }[] | undefined,
  markers: readonly FillMarker[],
): DailyValue[] {
  if (!points) return [];
  const buyDays = new Set(markers.filter((marker) => marker.side === "buy").map((marker) => marker.day));
  return points.map((point) => ({
    day: point.day,
    value: point.valueUsd,
    buy: buyDays.has(point.day),
  }));
}

/**
 * Owner book as public weights, gains, and indexed series.
 * Dollar amounts stay in this function. The returned model has none.
 */
export async function loadPublicFloor(): Promise<{
  model: PublicFloorModel;
  storageMessage: string | null;
  storageDetail: string | null;
}> {
  const [floor, book, equityCloses, cryptoCloses] = await Promise.all([
    loadOperatorFloor(),
    loadOperatorFills(),
    loadEquityCloses(EQUITIES),
    loadCryptoCloses(["SUI"]),
  ]);
  const today = yahooSessionDay(Date.now() / 1000) ?? "";
  const inputs: PublicHoldingInput[] = [];
  for (const ticker of ["SUI", ...EQUITIES] as const) {
    const face = floor.faces[ticker];
    const value =
      typeof face?.totalUsd === "number" && Number.isFinite(face.totalUsd) && face.totalUsd > 0
        ? face.totalUsd
        : null;
    const live =
      typeof face?.priceUsd === "number" && Number.isFinite(face.priceUsd) && face.priceUsd > 0
        ? face.priceUsd
        : null;
    const closes =
      ticker === "SUI" ? (cryptoCloses.SUI ?? []) : (equityCloses[ticker] ?? []);
    const position = assembleNodePosition({
      fills: book.fills,
      ticker,
      sleeves: floor.sleeves[ticker],
      priceUsd: live,
      closes,
      today,
    });
    const ledger = position?.ledger.status === "matched" ? position.ledger : null;
    const chart = ledger && position?.chart?.mode === "matched" ? position.chart : null;
    inputs.push({
      ticker,
      value,
      firstBuyPrice: ledger ? firstBuyPriceFromMarkers(ledger.markers) : null,
      livePrice: ledger ? live : null,
      daily: chart && ledger ? dailyFromPosition(chart.points, ledger.markers) : [],
    });
  }
  return {
    model: toPublicFloor(inputs),
    storageMessage: floor.storageMessage,
    storageDetail: floor.storageDetail,
  };
}
