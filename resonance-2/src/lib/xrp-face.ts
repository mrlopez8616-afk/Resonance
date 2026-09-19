import { XRP_SLEEVES, type XrpSleeve } from "@/data/xrp-sleeves";

export type XrpQuote = {
  usd: number;
  source: string;
  fetchedAt: string;
};

export type XrpSleeveFace = {
  id: XrpSleeve["id"];
  label: string;
  quantity: string;
  quantityLabel: string;
  source: XrpSleeve["source"];
  manual: boolean;
};

export type XrpFaceData = {
  ticker: "XRP";
  priceUsd: number | null;
  priceLabel: string;
  source: string | null;
  fetchedAt: string | null;
  sleeves: XrpSleeveFace[];
  totalXrp: number;
  totalUsd: number | null;
  totalUsdLabel: string;
};

export function sleeveQuantityNumber(quantity: string): number {
  const value = Number(quantity);
  return Number.isFinite(value) ? value : 0;
}

export function totalSleeveQuantity(sleeves: readonly XrpSleeve[]): number {
  return sleeves.reduce(
    (sum, sleeve) => sum + sleeveQuantityNumber(sleeve.quantity),
    0,
  );
}

export function formatSleeveQuantity(quantity: string): string {
  const value = sleeveQuantityNumber(quantity);
  if (!Number.isFinite(value) || value === 0) {
    const trimmed = quantity.trim();
    return trimmed || "—";
  }
  const digits = value >= 1000 ? 0 : 1;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatXrpPrice(usd: number | null): string {
  if (usd === null || !Number.isFinite(usd) || usd <= 0) return "—";
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

export function formatCompactUsd(usd: number | null): string {
  if (usd === null || !Number.isFinite(usd)) return "—";
  if (Math.abs(usd) >= 1000) {
    return `~$${(usd / 1000).toFixed(1)}k`;
  }
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function assembleXrpFace(
  sleeves: readonly XrpSleeve[] = XRP_SLEEVES,
  quote: XrpQuote | null = null,
): XrpFaceData {
  const totalXrp = totalSleeveQuantity(sleeves);
  const priceUsd =
    quote && Number.isFinite(quote.usd) && quote.usd > 0 ? quote.usd : null;
  const totalUsd = priceUsd === null ? null : totalXrp * priceUsd;

  return {
    ticker: "XRP",
    priceUsd,
    priceLabel: formatXrpPrice(priceUsd),
    source: quote?.source ?? null,
    fetchedAt: quote?.fetchedAt ?? null,
    sleeves: sleeves.map((sleeve) => ({
      id: sleeve.id,
      label: sleeve.label,
      quantity: sleeve.quantity,
      quantityLabel: formatSleeveQuantity(sleeve.quantity),
      source: sleeve.source,
      manual: sleeve.manual,
    })),
    totalXrp,
    totalUsd,
    totalUsdLabel: formatCompactUsd(totalUsd),
  };
}
