import "server-only";

import { AI_STOCK_TICKERS } from "@/lib/ai-stocks";
import { yahooSessionDay } from "@/lib/equity-chart";
import { loadOperatorFloor } from "@/lib/operator-floor";
import {
  publicBarsForBook,
  publicBarsForRollup,
  type ClosedLotBarInput,
  type OpenLotBarInput,
  type PublicLotBar,
} from "@/lib/lot-bars";
import {
  assembleNodePosition,
  displayLotBooks,
  rollupHoldingBooks,
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
function openInputs(
  books: readonly { ledger: { openLots: readonly {
    time: string;
    day: string;
    remainingQty: string;
    originalQty: string;
    price: string;
    entryUsd: number;
    valueUsd: number | null;
    pnlUsd: number | null;
    pnlPct: number | null;
  }[] } }[],
): OpenLotBarInput[] {
  return books.flatMap((book) =>
    book.ledger.openLots.map((lot) => ({
      time: lot.time,
      day: lot.day,
      remainingQty: lot.remainingQty,
      originalQty: lot.originalQty,
      price: lot.price,
      entryUsd: lot.entryUsd,
      valueUsd: lot.valueUsd,
      pnlUsd: lot.pnlUsd,
      pnlPct: lot.pnlPct,
    })),
  );
}

function closedInputs(
  books: readonly { ledger: { closedLots: readonly {
    time: string;
    day: string;
    soldDay: string | null;
    originalQty: string;
    price: string;
    exitUsd: number | null;
    realizedPnlUsd: number;
    realizedPct: number | null;
  }[] } }[],
): ClosedLotBarInput[] {
  return books.flatMap((book) =>
    book.ledger.closedLots.flatMap((lot) => {
      const entry = Number(lot.price);
      if (lot.exitUsd === null || lot.soldDay === null || !(entry > 0)) return [];
      return [
        {
          time: lot.time,
          day: lot.day,
          soldDay: lot.soldDay,
          originalQty: lot.originalQty,
          price: lot.price,
          entryUsd: entry,
          exitUsd: lot.exitUsd,
          realizedPnlUsd: lot.realizedPnlUsd,
          realizedPct: lot.realizedPct,
        },
      ];
    }),
  );
}

export async function loadPublicFloor(): Promise<{
  model: PublicFloorModel;
  nodeBars: Readonly<Record<string, readonly PublicLotBar[]>>;
  groupBars: Readonly<Record<"crypto" | "ai-stocks", readonly PublicLotBar[]>>;
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
  const nodeBars: Record<string, readonly PublicLotBar[]> = {};
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
    if (position) {
      const listed = displayLotBooks(position.books, position.agenticLines.length > 0);
      const books = listed.length > 0 ? listed : [{ name: null, ledger: position.ledger }];
      nodeBars[ticker] = publicBarsForBook(openInputs(books), closedInputs(books));
    }
  }
  const prices = Object.fromEntries(
    (["SUI", ...EQUITIES] as const).map((ticker) => [ticker, floor.faces[ticker]?.priceUsd ?? null]),
  );
  const groupBars = {
    crypto: publicBarsForRollup(
      rollupHoldingBooks({
        tickers: ["SUI"],
        fills: book.fills,
        sleeves: floor.sleeves,
        prices,
        closes: { SUI: cryptoCloses.SUI ?? [] },
        today,
      }).rows,
      "crypto",
    ),
    "ai-stocks": publicBarsForRollup(
      rollupHoldingBooks({
        tickers: [...EQUITIES],
        fills: book.fills,
        sleeves: floor.sleeves,
        prices,
        closes: equityCloses,
        today,
      }).rows,
      "ai-stocks",
    ),
  };
  return {
    model: toPublicFloor(inputs),
    nodeBars,
    groupBars,
    storageMessage: floor.storageMessage,
    storageDetail: floor.storageDetail,
  };
}
