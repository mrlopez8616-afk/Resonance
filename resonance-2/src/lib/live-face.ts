import type { NodeSleeve } from "@/data/sleeves";
import { AI_STOCK_TICKERS, RETIRED_AI_TICKERS } from "@/lib/ai-stocks";
import { isDecimalString } from "@/lib/decimal";

export type SpotQuote = {
  usd: number;
  source: string;
  fetchedAt: string;
  /**
   * Feed-reported percent change versus the prior price (CoinGecko / Binance
   * rolling 24h, or Yahoo's change vs the previous close). Null when that
   * payload did not include it. Never invented.
   */
  change24hPct?: number | null;
  /**
   * Prior USD price when the feed reported one directly (Yahoo previous
   * close, or the previous daily close on the chart). Null when absent.
   */
  price24hAgoUsd?: number | null;
};

export type SleeveFace = {
  id: string;
  label: string;
  quantity: string;
  quantityLabel: string;
  source: NodeSleeve["source"];
  manual: boolean;
  note?: string;
};

export type FaceUnitWord = "tokens" | "shares";

export type LiveFaceData = {
  ticker: string;
  priceUsd: number | null;
  priceLabel: string;
  source: string | null;
  fetchedAt: string | null;
  sleeves: SleeveFace[];
  totalUnits: number;
  totalUnitsLabel: string;
  totalUsd: number | null;
  totalUsdLabel: string;
  /** Equity faces say "shares". Crypto faces keep "tokens". */
  unitsWord: FaceUnitWord;
};

/** Live equity faces. Retired names stay off this list so they are not quoted. */
export const EQUITY_FACE_TICKERS = AI_STOCK_TICKERS;

const SHARE_TICKERS = new Set<string>([...AI_STOCK_TICKERS, ...RETIRED_AI_TICKERS]);

export function faceUnitWord(ticker: string): FaceUnitWord {
  return SHARE_TICKERS.has(ticker) ? "shares" : "tokens";
}

export function sleeveQuantityNumber(quantity: string): number {
  const value = Number(quantity);
  return Number.isFinite(value) ? value : 0;
}

export function totalSleeveQuantity(sleeves: readonly NodeSleeve[]): number {
  return sleeves.reduce(
    (sum, sleeve) => sum + sleeveQuantityNumber(sleeve.quantity),
    0,
  );
}

export function formatSleeveQuantity(quantity: string, note?: string): string {
  const parsed = Number(quantity);
  if (quantity.trim() === "" || !Number.isFinite(parsed)) {
    return quantity.trim() || "—";
  }
  // Lots at or above 1,000 keep an integer print (Flare vault) and up to two
  // stored decimals. Mid-size lots keep up to three stored
  // decimals so 51.601 XRP is not printed as 51.6. Smaller bands stay
  // on the original steps.
  const storedFraction =
    quantity.trim().split(".")[1]?.replace(/0+$/, "").length ?? 0;
  const storedHundredths =
    parsed >= 1000 ? Math.min(2, storedFraction) : null;
  const digits =
    storedHundredths ??
    (parsed >= 10 ? Math.max(1, Math.min(3, storedFraction)) : parsed >= 1 ? 3 : 6);
  const formatted = parsed.toLocaleString("en-US", {
    minimumFractionDigits: parsed === 0 ? 0 : digits,
    maximumFractionDigits: digits,
  });
  return note ? `${formatted} (${note})` : formatted;
}

export function formatSpotPrice(usd: number | null): string {
  if (usd === null || !Number.isFinite(usd) || usd <= 0) return "—";
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

export function formatTotalUnits(total: number): string {
  if (!Number.isFinite(total)) return "—";
  // A closed book prints the same "0" as a zero sleeve row (SUI Agentic).
  // Six fraction digits would ellipsis inside the square.
  if (total === 0) return "0";
  if (total >= 1000) {
    const thousandths = Number(total.toFixed(3));
    const hundredths = Number(total.toFixed(2));
    const tenths = Number(total.toFixed(1));
    const digits =
      thousandths !== hundredths ? 3 : hundredths === tenths ? 1 : 2;
    const rounded = digits === 3 ? thousandths : digits === 2 ? hundredths : tenths;
    return rounded.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }
  const digits = total >= 1 ? 3 : 6;
  return Number(total.toFixed(digits)).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatCompactUsd(usd: number | null): string {
  if (usd === null || !Number.isFinite(usd)) return "—";
  if (Math.abs(usd) >= 1000) {
    return `~$${(usd / 1000).toFixed(1)}k`;
  }
  return `~$${usd.toFixed(2)}`;
}

export function assembleLiveFace(
  ticker: string,
  sleeves: readonly NodeSleeve[],
  quote: SpotQuote | null = null,
): LiveFaceData {
  // An empty book is not a position. `every` on [] would otherwise print $0.
  const qtyKnown =
    sleeves.length > 0 &&
    sleeves.every((sleeve) => isDecimalString(sleeve.quantity));
  const totalUnits = qtyKnown ? totalSleeveQuantity(sleeves) : Number.NaN;
  const priceUsd =
    quote && Number.isFinite(quote.usd) && quote.usd > 0 ? quote.usd : null;
  const totalUsd =
    priceUsd === null || !qtyKnown ? null : totalUnits * priceUsd;

  return {
    ticker,
    priceUsd,
    priceLabel: formatSpotPrice(priceUsd),
    source: quote?.source ?? null,
    fetchedAt: quote?.fetchedAt ?? null,
    sleeves: sleeves.map((sleeve) => ({
      id: sleeve.id,
      label: sleeve.label,
      quantity: sleeve.quantity,
      quantityLabel: formatSleeveQuantity(sleeve.quantity),
      source: sleeve.source,
      manual: sleeve.manual,
      note: sleeve.note,
    })),
    totalUnits,
    totalUnitsLabel: qtyKnown ? formatTotalUnits(totalUnits) : "TBD",
    totalUsd,
    totalUsdLabel: formatCompactUsd(totalUsd),
    unitsWord: faceUnitWord(ticker),
  };
}
