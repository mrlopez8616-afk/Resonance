import { isDecimalString } from "@/lib/decimal";

/**
 * Portfolio mood — live book versus 24 hours ago.
 *
 * Deadband: the book is flat when the absolute value-weighted change is
 * strictly under 0.05% (`|Δ| < 0.05`). A move of exactly ±0.05% follows
 * the sign (up or down). The percent is rounded to 4 decimal places
 * before that comparison so binary dust cannot flip the band.
 *
 * Eligible holdings are the live floor faces with a positive quantity
 * (XRP, SUI, PWR, ETN, VRT, GEV, CEG, HUBB, HBAR). Zero-quantity sleeves
 * are ignored. Fight Desk bets are not holdings and are not in this list.
 *
 * A holding is included only when the feed supplied a positive current
 * USD price and a positive 24h-ago price. The prior price is the feed's
 * `price24hAgoUsd` when present; otherwise it is derived from the feed's
 * `change24hPct` as `price / (1 + pct/100)`. A change of -100% or worse
 * cannot produce a prior price, so that holding is excluded. Missing
 * fields are never filled in.
 *
 * Value coverage = included current value / current value of every
 * eligible holding that has a current price. The mood is unknown (neutral
 * wash, no percent) when there is nothing to include, value coverage is
 * under 50%, or more than half of the eligible holdings have no current
 * price. `partial` is true only when a direction was published and at
 * least one eligible holding was left out.
 */

export const FLAT_DEADBAND_PCT = 0.05;
export const MIN_VALUE_COVERAGE = 0.5;

/** Live floor faces. Offline roster rows and Fight Desk bets stay out. */
export const PORTFOLIO_FACE_TICKERS = [
  "XRP",
  "SUI",
  "PWR",
  "ETN",
  "VRT",
  "GEV",
  "CEG",
  "HUBB",
  "HBAR",
] as const;

export type PortfolioFaceTicker = (typeof PORTFOLIO_FACE_TICKERS)[number];

export type MoodTone = "up" | "down" | "flat" | "unknown";

export type MoodHolding = {
  id: string;
  /** NaN marks a book whose quantity could not be read. It counts as excluded. */
  quantity: number;
  priceUsd: number | null;
  price24hAgoUsd?: number | null;
  change24hPct?: number | null;
};

export type PortfolioMood = {
  tone: MoodTone;
  /** Signed percent. Null when the tone is unknown. */
  changePct: number | null;
  partial: boolean;
  included: number;
  excluded: number;
  eligible: number;
  /** Included current value. Null when the tone is unknown. */
  valueNow: number | null;
  /** Included value at the 24h-ago price. Null when the tone is unknown. */
  value24hAgo: number | null;
  /** Share of priced value that had a 24h-ago price. Null when nothing was priced. */
  coverage: number | null;
};

export type MoodSleeve = { quantity: string };

export type MoodQuote = {
  usd?: number | null;
  change24hPct?: number | null;
  price24hAgoUsd?: number | null;
};

const TONES: readonly MoodTone[] = ["up", "down", "flat", "unknown"];

export function unknownPortfolioMood(): PortfolioMood {
  return {
    tone: "unknown",
    changePct: null,
    partial: false,
    included: 0,
    excluded: 0,
    eligible: 0,
    valueNow: null,
    value24hAgo: null,
    coverage: null,
  };
}

export function isPortfolioMood(value: unknown): value is PortfolioMood {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<PortfolioMood>;
  const toneOk = TONES.includes(row.tone as MoodTone);
  const pctOk = row.changePct === null || typeof row.changePct === "number";
  return toneOk && pctOk && typeof row.partial === "boolean";
}

function positivePrice(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

/** Prior USD from a direct feed price, else from a feed percent. Never guessed. */
export function priorUsd(holding: MoodHolding): number | null {
  const direct = positivePrice(holding.price24hAgoUsd);
  if (direct !== null) return direct;
  const price = positivePrice(holding.priceUsd);
  const pct = holding.change24hPct;
  if (
    price === null ||
    typeof pct !== "number" ||
    !Number.isFinite(pct) ||
    pct <= -100
  ) {
    return null;
  }
  const ago = price / (1 + pct / 100);
  return positivePrice(ago);
}

export function holdingFromBook(
  ticker: string,
  sleeves: readonly MoodSleeve[] | undefined,
  quote: MoodQuote | null,
): MoodHolding {
  const priceUsd = positivePrice(quote?.usd);
  const change24hPct =
    typeof quote?.change24hPct === "number" && Number.isFinite(quote.change24hPct)
      ? quote.change24hPct
      : null;
  const price24hAgoUsd = positivePrice(quote?.price24hAgoUsd);
  if (!sleeves) {
    return { id: ticker, quantity: Number.NaN, priceUsd, change24hPct, price24hAgoUsd };
  }
  let quantity = 0;
  for (const sleeve of sleeves) {
    if (!isDecimalString(sleeve.quantity)) {
      return { id: ticker, quantity: Number.NaN, priceUsd, change24hPct, price24hAgoUsd };
    }
    quantity += Number(sleeve.quantity);
  }
  return { id: ticker, quantity, priceUsd, change24hPct, price24hAgoUsd };
}

export function moodHoldingsFromBooks(
  books: Readonly<Record<string, readonly MoodSleeve[] | undefined>>,
  quotes: Readonly<Record<string, MoodQuote | null | undefined>>,
): MoodHolding[] {
  return PORTFOLIO_FACE_TICKERS.map((ticker) =>
    holdingFromBook(ticker, books[ticker], quotes[ticker] ?? null),
  );
}

function roundPct(value: number): number {
  const rounded = Math.round(value * 10_000) / 10_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function portfolioMood(holdings: readonly MoodHolding[]): PortfolioMood {
  let eligible = 0;
  let included = 0;
  let excluded = 0;
  let unpriced = 0;
  let valueNow = 0;
  let valueAgo = 0;
  let pricedNow = 0;

  for (const holding of holdings) {
    const qty = holding.quantity;
    if (!Number.isFinite(qty) || qty < 0) {
      eligible += 1;
      excluded += 1;
      unpriced += 1;
      continue;
    }
    if (qty === 0) continue;

    eligible += 1;
    const now = positivePrice(holding.priceUsd);
    if (now === null) {
      excluded += 1;
      unpriced += 1;
      continue;
    }

    const current = qty * now;
    pricedNow += current;
    const ago = priorUsd(holding);
    if (ago === null) {
      excluded += 1;
      continue;
    }

    included += 1;
    valueNow += current;
    valueAgo += qty * ago;
  }

  const coverage = pricedNow > 0 ? valueNow / pricedNow : null;
  const unpricedRatio = eligible > 0 ? unpriced / eligible : 1;
  const coverageOk = coverage !== null && coverage >= MIN_VALUE_COVERAGE;
  const pricedCountOk = eligible > 0 && unpricedRatio <= 0.5;
  const baselineOk = included > 0 && valueAgo > 0;

  if (!coverageOk || !pricedCountOk || !baselineOk) {
    return {
      tone: "unknown",
      changePct: null,
      partial: false,
      included,
      excluded,
      eligible,
      valueNow: null,
      value24hAgo: null,
      coverage,
    };
  }

  const changePct = roundPct(((valueNow - valueAgo) / valueAgo) * 100);
  const tone: MoodTone =
    Math.abs(changePct) < FLAT_DEADBAND_PCT ? "flat" : changePct > 0 ? "up" : "down";

  return {
    tone,
    changePct,
    partial: excluded > 0,
    included,
    excluded,
    eligible,
    valueNow,
    value24hAgo: valueAgo,
    coverage,
  };
}

export function formatMoodChange(changePct: number | null): string {
  if (changePct === null || !Number.isFinite(changePct)) return "—";
  const rounded = roundPct(changePct);
  if (rounded === 0) return "0.00%";
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(2)}%`;
}

export function moodToneLabel(tone: MoodTone): string {
  switch (tone) {
    case "up":
      return "Up";
    case "down":
      return "Down";
    case "flat":
      return "Flat";
    case "unknown":
      return "Unavailable";
  }
}

const PREVIEW_TONES = new Set<string>(["up", "down", "flat", "unknown", "neutral"]);

export function parseMoodPreview(value: string | null): MoodTone | null {
  if (!value) return null;
  const token = value.trim().toLowerCase();
  if (!PREVIEW_TONES.has(token)) return null;
  if (token === "neutral") return "flat";
  return token as MoodTone;
}

/**
 * Development-only wash override (`?mood=up|down|flat|unknown`). Production
 * ignores the query so a preview cannot ship as a live figure.
 */
export function moodPreviewFromQuery(
  value: string | null,
  nodeEnv: string | undefined,
): MoodTone | null {
  if (nodeEnv === "production") return null;
  return parseMoodPreview(value);
}
