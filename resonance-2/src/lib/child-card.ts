import type { LiveFaceData, SleeveFace } from "@/lib/live-face";
import { formatCompactUsd, formatSleeveQuantity } from "@/lib/live-face";
import { formatHomePct, homeQuoteFresh } from "@/lib/home-lines";
import { isDecimalString } from "@/lib/decimal";
import { valueCardFromFace, type ValueCardLabel, type ValueCardModel } from "@/lib/value-card";

export type ChildCardTone = "up" | "down" | "flat";

export type ChildCardLine = {
  text: string;
  tone?: ChildCardTone;
};

export type ChildCardSpark = {
  prices: number[];
  tone: ChildCardTone;
};

/** One child card. Lines without data are omitted. The spark is omitted without history. */
export type ChildCardModel = {
  ticker: string;
  headline: string | null;
  priceLine: string | null;
  label: ValueCardLabel | null;
  lines: ChildCardLine[];
  footerLines: ChildCardLine[];
  spark: ChildCardSpark | null;
  role: string | null;
};

const SPARK_POINTS = 48;
const ZERO_VALUE = /\$0\.00/;

function downsample(values: readonly number[], max: number): number[] {
  if (values.length <= max) return values.slice();
  const last = values.length - 1;
  const out: number[] = [];
  for (let index = 0; index < max; index += 1) {
    const at = Math.round((index * last) / (max - 1));
    const value = values[at];
    if (typeof value === "number") out.push(value);
  }
  return out;
}

/** Directional history. Fewer than two real prices is not a chart. */
export function priceSpark(prices: readonly number[] | null | undefined): ChildCardSpark | null {
  if (!prices) return null;
  const clean = prices.filter((price) => Number.isFinite(price) && price > 0);
  if (clean.length < 2) return null;
  const first = clean[0] ?? 0;
  const last = clean[clean.length - 1] ?? first;
  const tone: ChildCardTone = last > first ? "up" : last < first ? "down" : "flat";
  return { prices: downsample(clean, SPARK_POINTS), tone };
}

/** Day move. A missing or stale quote is not a line. */
export function dayChangeLine(
  changePct: number | null | undefined,
  fetchedAt: string | null | undefined,
  now: Date,
): ChildCardLine | null {
  if (!homeQuoteFresh(fetchedAt, now)) return null;
  if (typeof changePct !== "number" || !Number.isFinite(changePct)) return null;
  const text = formatHomePct(changePct);
  if (!text) return null;
  const tone: ChildCardTone = changePct > 0 ? "up" : changePct < 0 ? "down" : "flat";
  return { text, tone };
}

function withoutZeroValue(model: ValueCardModel): ValueCardModel {
  if (!model.headline || !ZERO_VALUE.test(model.headline)) return model;
  return {
    headline: null,
    priceLine: model.priceLine,
    label: model.priceLine ? "no position" : "not connected",
  };
}

function treasuryLabel(sleeve: SleeveFace): string | null {
  if (sleeve.id === "rh-agentic") return "Agentic";
  if (sleeve.id === "flare-vault") return "Flare / Xaman vault";
  return null;
}

/**
 * Agentic and the Flare/Xaman vault, each on its own line.
 * The vault line always says manual. A lot without a positive quantity or a
 * live price is left out, including a real zero.
 */
export function xrpTreasuryLines(
  sleeves: readonly SleeveFace[],
  priceUsd: number | null,
): ChildCardLine[] {
  if (typeof priceUsd !== "number" || !Number.isFinite(priceUsd) || priceUsd <= 0) return [];
  const lines: ChildCardLine[] = [];
  for (const id of ["rh-agentic", "flare-vault"] as const) {
    const sleeve = sleeves.find((row) => row.id === id);
    if (!sleeve) continue;
    const label = treasuryLabel(sleeve);
    if (!label) continue;
    if (!isDecimalString(sleeve.quantity) || Number(sleeve.quantity) <= 0) continue;
    const value = Number(sleeve.quantity) * priceUsd;
    const valueLabel = formatCompactUsd(value);
    if (!valueLabel || ZERO_VALUE.test(valueLabel) || valueLabel === "—") continue;
    const manual = sleeve.manual || sleeve.id === "flare-vault";
    const text = `${label} ${sleeve.quantityLabel || formatSleeveQuantity(sleeve.quantity)} · ${valueLabel}${manual ? " · manual" : ""}`;
    lines.push({ text });
  }
  return lines;
}

function textLine(text: string | null | undefined): ChildCardLine | null {
  if (!text?.trim()) return null;
  return { text: text.trim() };
}

/**
 * Headline is the position value from the live face (quantity times price).
 * For XRP that face already sums Agentic and the vault. The split is the lines
 * under the price. `$0` is not a headline.
 */
export function holdingChildModel(input: {
  face: LiveFaceData;
  changePct?: number | null;
  fetchedAt?: string | null;
  now: Date;
  catalyst?: string | null;
  history?: readonly number[] | null;
  treasury?: boolean;
  role?: string | null;
  position?: readonly ChildCardLine[];
  /** Page layout puts the catalyst under the chart. The card keeps it with the day move. */
  catalystAfterChart?: boolean;
}): ChildCardModel {
  const card = withoutZeroValue(valueCardFromFace(input.face));
  const day = dayChangeLine(input.changePct, input.fetchedAt, input.now);
  const catalyst = textLine(input.catalyst);
  const treasury = input.treasury ? xrpTreasuryLines(input.face.sleeves, input.face.priceUsd) : [];
  const position = input.position ?? [];
  const before = input.catalystAfterChart
    ? [day, ...position]
    : [day, catalyst, ...treasury, ...position];
  const after = input.catalystAfterChart ? [catalyst] : [];
  return {
    ticker: input.face.ticker,
    headline: card.headline,
    priceLine: card.priceLine,
    label: card.label,
    lines: before.flatMap((line) => (line ? [line] : [])),
    footerLines: after.flatMap((line) => (line ? [line] : [])),
    spark: priceSpark(input.history),
    role: input.role?.trim() ? input.role.trim() : null,
  };
}

/** Shares, then cost and P/L when the fills explain the sleeve. */
export function positionLines(
  quantity: string | null,
  cost: { averageLabel: string; pnl: ChildCardLine | null } | null,
): ChildCardLine[] {
  if (!quantity || !isDecimalString(quantity) || Number(quantity) <= 0) return [];
  const shares = `${formatSleeveQuantity(quantity)} shares`;
  const lines: ChildCardLine[] = [{ text: shares }];
  if (cost?.averageLabel && !ZERO_VALUE.test(cost.averageLabel)) {
    lines.push({ text: cost.averageLabel });
    if (cost.pnl) lines.push(cost.pnl);
  }
  return lines;
}
