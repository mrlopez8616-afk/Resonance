import { subtractDecimal } from "@/lib/decimal";
import {
  formatLotPct,
  formatLotUsd,
  formatSignedUsd,
  type RollupRow,
} from "@/lib/position-lots";

export type LotBarTone = "up" | "down" | "flat";

export type LotBar = {
  id: string;
  /** Buy day `YYYY-MM-DD`, or empty on a parent bar. */
  day: string;
  /** X-axis label. A buy date (`Sep 18`) or a child ticker. */
  axisLabel: string;
  tone: LotBarTone;
  /** Bar height. Dollars in private mode, percent in public mode. */
  magnitude: number;
  partial: boolean;
  /** Closed lot drawn as a sale. Height is realized gain or loss. */
  sold: boolean;
  /** 1-based order among node bars. 0 on a parent bar, which is not a lot. */
  sequence: number;
  /** Earliest lot on this chart. */
  first: boolean;
  remaining: string;
  original: string;
  entryLabel: string | null;
  /** Weighted exit, sold bars only. */
  exitLabel: string | null;
  /** Session day the lot was sold. Empty when the bar is still open. */
  soldDay: string;
  valueLabel: string | null;
  pnlUsd: number | null;
  pnlPct: number | null;
  /** Set on a parent bar. Tap opens the child page. */
  href: string | null;
};

export type LotBarModel = {
  bars: LotBar[];
  caption: string | null;
};

export type OpenLotBarInput = {
  time: string;
  day: string;
  remainingQty: string;
  originalQty: string;
  price: string;
  entryUsd: number;
  valueUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
};

export type ClosedLotBarInput = {
  time: string;
  day: string;
  soldDay: string;
  originalQty: string;
  price: string;
  entryUsd: number;
  exitUsd: number;
  realizedPnlUsd: number;
  realizedPct: number | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function lotDateLabel(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return day;
  return `${month} ${Number(match[3])}`;
}

function toneOf(value: number): LotBarTone {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

function isPartial(remaining: string, original: string): boolean {
  return subtractDecimal(remaining, original) !== "0";
}

function withOrder(bars: LotBar[]): LotBar[] {
  return bars.map((bar, index) => ({
    ...bar,
    sequence: index + 1,
    first: index === 0,
  }));
}

function blankBar(partial: Partial<LotBar> & Pick<LotBar, "id" | "axisLabel" | "tone" | "magnitude">): LotBar {
  return {
    day: "",
    partial: false,
    sold: false,
    sequence: 0,
    first: false,
    remaining: "",
    original: "",
    entryLabel: null,
    exitLabel: null,
    soldDay: "",
    valueLabel: null,
    pnlUsd: null,
    pnlPct: null,
    href: null,
    ...partial,
  };
}

/**
 * One bar per open or partially sold lot, oldest buy first.
 * A lot with no entry or no live P/L is left out. Nothing here invents a cost.
 * The earliest bar is the first buy. Later bars are numbered from 2.
 */
export function barsFromOpenLots(
  lots: readonly OpenLotBarInput[],
  publicMode: boolean,
): LotBar[] {
  const usable = lots.filter((lot) => {
    if (!(lot.entryUsd > 0) || !Number.isFinite(lot.entryUsd)) return false;
    if (publicMode) return lot.pnlPct !== null && Number.isFinite(lot.pnlPct);
    return lot.pnlUsd !== null && Number.isFinite(lot.pnlUsd);
  });
  usable.sort((left, right) => left.day.localeCompare(right.day) || left.time.localeCompare(right.time));
  return withOrder(
    usable.map((lot) => {
      const magnitude = publicMode ? (lot.pnlPct ?? 0) : (lot.pnlUsd ?? 0);
      const partial = isPartial(lot.remainingQty, lot.originalQty);
      return blankBar({
        id: `${lot.time}:${lot.price}:${lot.remainingQty}`,
        day: lot.day,
        axisLabel: lotDateLabel(lot.day),
        tone: toneOf(magnitude),
        magnitude,
        partial,
        remaining: lot.remainingQty,
        original: lot.originalQty,
        entryLabel: formatLotUsd(lot.entryUsd),
        valueLabel: formatLotUsd(lot.valueUsd),
        pnlUsd: lot.pnlUsd,
        pnlPct: lot.pnlPct,
      });
    }),
  );
}

/**
 * One bar per fully closed lot whose exit is known from the sells.
 * Height is realized gain or loss. A lot without an entry or a clean exit is left out.
 */
export function barsFromClosedLots(
  lots: readonly ClosedLotBarInput[],
  publicMode: boolean,
): LotBar[] {
  const usable = lots.filter((lot) => {
    if (!(lot.entryUsd > 0) || !Number.isFinite(lot.entryUsd)) return false;
    if (!(lot.exitUsd > 0) || !Number.isFinite(lot.exitUsd)) return false;
    if (!lot.soldDay) return false;
    if (publicMode) return lot.realizedPct !== null && Number.isFinite(lot.realizedPct);
    return Number.isFinite(lot.realizedPnlUsd);
  });
  usable.sort((left, right) => left.day.localeCompare(right.day) || left.time.localeCompare(right.time));
  return withOrder(
    usable.map((lot) => {
      const magnitude = publicMode ? (lot.realizedPct ?? 0) : lot.realizedPnlUsd;
      return blankBar({
        id: `${lot.time}:sold:${lot.price}`,
        day: lot.day,
        axisLabel: lotDateLabel(lot.day),
        tone: toneOf(magnitude),
        magnitude,
        sold: true,
        original: lot.originalQty,
        entryLabel: formatLotUsd(lot.entryUsd),
        exitLabel: formatLotUsd(lot.exitUsd),
        soldDay: lot.soldDay,
        pnlUsd: lot.realizedPnlUsd,
        pnlPct: lot.realizedPct,
      });
    }),
  );
}

/** Shares with no entry. Each quantity is printed as given. */
export function unknownEntryCaption(ticker: string, shares: readonly (string | null | undefined)[]): string | null {
  const name = ticker.trim() || "shares";
  const parts = shares
    .map((value) => value?.trim() ?? "")
    .filter((value) => value && Number(value) > 0);
  if (parts.length === 0) return null;
  return parts.map((value) => `${value} ${name} entry unknown, not charted`).join(" · ");
}

export function unknownTickerCaption(tickers: readonly string[]): string | null {
  if (tickers.length === 0) return null;
  return tickers.map((ticker) => `${ticker} entry unknown, not charted`).join(" · ");
}

/**
 * One bar per child that has a real unrealized gain or loss.
 * A child with no cost is named in the caption and gets no bar.
 */
export function barsFromRollup(
  rows: readonly RollupRow[],
  parentId: string,
  publicMode: boolean,
): LotBarModel {
  const bars: LotBar[] = [];
  const hidden: string[] = [];
  for (const row of rows) {
    const magnitude = publicMode ? row.pnlPct : row.pnlUsd;
    if (magnitude === null || !Number.isFinite(magnitude)) {
      hidden.push(row.ticker);
      continue;
    }
    const id = row.ticker.toLowerCase();
    bars.push(
      blankBar({
        id: row.ticker,
        axisLabel: row.ticker,
        tone: toneOf(magnitude),
        magnitude,
        valueLabel: formatLotUsd(row.valueUsd),
        pnlUsd: row.pnlUsd,
        pnlPct: row.pnlPct,
        href: `/n/${parentId}/${id}`,
      }),
    );
  }
  return { bars, caption: unknownTickerCaption(hidden) };
}

function badgeLabel(bar: LotBar): string | null {
  if (bar.sequence < 1) return null;
  return bar.first ? "First buy" : `#${bar.sequence}`;
}

/** Signed dollars in private mode, percent in public mode. No dollar sign when public. */
export function lotBarValueLabel(bar: LotBar, publicMode: boolean): string | null {
  const label = publicMode ? formatLotPct(bar.pnlPct) : formatSignedUsd(bar.pnlUsd);
  if (!label) return null;
  return label.replace("-", "−");
}

/**
 * Public chart row. Percent only. No dollar, share, or price fields,
 * so a public payload can carry it.
 */
export type PublicLotBar = {
  id: string;
  day: string;
  label: string;
  tone: LotBarTone;
  percent: number;
  partial: boolean;
  sold: boolean;
  sequence: number;
  first: boolean;
  href: string | null;
};

export function toPublicLotBars(bars: readonly LotBar[]): PublicLotBar[] {
  return bars.map((bar) => ({
    id: bar.id,
    day: bar.day,
    label: bar.axisLabel,
    tone: bar.tone,
    percent: bar.magnitude,
    partial: bar.partial,
    sold: bar.sold,
    sequence: bar.sequence,
    first: bar.first,
    href: bar.href,
  }));
}

/** Open lots win. A flat book uses the closed lots. Dollars are dropped. */
export function publicBarsForBook(
  open: readonly OpenLotBarInput[],
  closed: readonly ClosedLotBarInput[],
): PublicLotBar[] {
  const bars = open.length > 0 ? barsFromOpenLots(open, true) : barsFromClosedLots(closed, true);
  return toPublicLotBars(bars);
}

export function publicBarsForRollup(rows: readonly RollupRow[], parentId: string): PublicLotBar[] {
  return toPublicLotBars(barsFromRollup(rows, parentId, true).bars);
}

/** Chart model for a public page. Labels and popovers read the percent only. */
export function publicLotChartModel(bars: readonly PublicLotBar[]): LotBarModel {
  return {
    caption: null,
    bars: bars.map((bar) =>
      blankBar({
        id: bar.id,
        day: bar.day,
        axisLabel: bar.label,
        tone: bar.tone,
        magnitude: bar.percent,
        partial: bar.partial,
        sold: bar.sold,
        sequence: bar.sequence,
        first: bar.first,
        pnlPct: bar.percent,
        href: bar.href,
      }),
    ),
  };
}

/** Popover lines. Public mode is the date, the lot label, and the percent. */
export function lotBarPopoverLines(bar: LotBar, publicMode: boolean): string[] {
  const percent = formatLotPct(bar.pnlPct);
  const badge = badgeLabel(bar);
  if (publicMode) {
    return [bar.axisLabel || null, badge, percent].filter((line): line is string => Boolean(line));
  }
  if (bar.sold) {
    const money = formatSignedUsd(bar.pnlUsd);
    const gain = [money, percent].filter(Boolean).join(" · ");
    return [
      badge,
      bar.axisLabel ? `bought ${bar.axisLabel}` : null,
      bar.soldDay ? `sold ${lotDateLabel(bar.soldDay)}` : null,
      bar.original || null,
      bar.entryLabel ? `entry ${bar.entryLabel}` : null,
      bar.exitLabel ? `exit ${bar.exitLabel}` : null,
      gain || null,
    ].filter((line): line is string => Boolean(line));
  }
  const shares = bar.partial ? `${bar.remaining} of ${bar.original}` : bar.remaining;
  const money = formatSignedUsd(bar.pnlUsd);
  const gain = [money, percent].filter(Boolean).join(" · ");
  return [
    badge,
    bar.axisLabel,
    shares || null,
    bar.entryLabel ? `entry ${bar.entryLabel}` : null,
    bar.valueLabel ? `value ${bar.valueLabel}` : null,
    gain || null,
  ].filter((line): line is string => Boolean(line));
}
