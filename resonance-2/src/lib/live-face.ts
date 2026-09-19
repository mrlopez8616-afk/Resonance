import type { NodeSleeve } from "@/data/sleeves";

export type SpotQuote = {
  usd: number;
  source: string;
  fetchedAt: string;
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
};

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
  const digits = parsed >= 1000 ? 0 : parsed >= 10 ? 1 : 3;
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
  const digits = total >= 1000 ? 1 : 3;
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
  const totalUnits = totalSleeveQuantity(sleeves);
  const priceUsd =
    quote && Number.isFinite(quote.usd) && quote.usd > 0 ? quote.usd : null;
  const totalUsd = priceUsd === null ? null : totalUnits * priceUsd;

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
    totalUnitsLabel: formatTotalUnits(totalUnits),
    totalUsd,
    totalUsdLabel: formatCompactUsd(totalUsd),
  };
}
