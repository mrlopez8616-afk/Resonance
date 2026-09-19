import type { FillSleeveId } from "@/data/fills";
import type { NodeSleeve } from "@/data/sleeves";
import { PWR_SLEEVES } from "@/data/pwr-sleeves";
import { SUI_SLEEVES } from "@/data/sui-sleeves";
import { XRP_SLEEVES } from "@/data/xrp-sleeves";
import { addDecimal, subtractDecimal } from "@/lib/decimal";
import {
  FLARE_VAULT_SLEEVE_ID,
  FillIngestError,
  type LockedTicker,
  type NormalizedFillEvent,
} from "@/lib/fill-event";

export const LIVE_SLEEVE_SEEDS: Record<string, readonly NodeSleeve[]> = {
  XRP: XRP_SLEEVES,
  SUI: SUI_SLEEVES,
  PWR: PWR_SLEEVES,
};

export type SleevePrints = Record<string, Record<string, string>>;

export function seedBookForTicker(ticker: string): readonly NodeSleeve[] | null {
  return LIVE_SLEEVE_SEEDS[ticker] ?? null;
}

export function findSeedSleeve(
  ticker: string,
  sleeveId: string,
): NodeSleeve | null {
  return seedBookForTicker(ticker)?.find((row) => row.id === sleeveId) ?? null;
}

export function currentSleeveQuantity(
  prints: SleevePrints,
  ticker: string,
  sleeveId: string,
): string | null {
  const override = prints[ticker]?.[sleeveId];
  if (typeof override === "string" && override.trim()) return override.trim();
  return findSeedSleeve(ticker, sleeveId)?.quantity ?? null;
}

export function applyQuantityDelta(
  current: string,
  side: NormalizedFillEvent["side"],
  qty: string,
): string {
  return side === "buy" ? addDecimal(current, qty) : subtractDecimal(current, qty);
}

/**
 * Apply a fill to writable sleeve prints.
 * `flare-vault` is refused. Unknown live sleeve ids are refused.
 * Offline locked tickers skip apply (log-only).
 */
export function applyFillToSleevePrints(
  prints: SleevePrints,
  event: NormalizedFillEvent,
): { prints: SleevePrints; applied: boolean; nextQuantity: string | null } {
  if (event.sleeve === (FLARE_VAULT_SLEEVE_ID as unknown as FillSleeveId)) {
    throw new FillIngestError(
      "flare-vault is founder-entered only and cannot be written by ingest.",
    );
  }

  const book = seedBookForTicker(event.ticker);
  if (!book) {
    return { prints, applied: false, nextQuantity: null };
  }

  const seed = findSeedSleeve(event.ticker, event.sleeve);
  if (!seed) {
    throw new FillIngestError(
      `sleeve ${event.sleeve} is not on the ${event.ticker} face.`,
    );
  }
  if (seed.id === FLARE_VAULT_SLEEVE_ID || seed.manual) {
    throw new FillIngestError(
      "manual / flare-vault sleeves cannot be written by ingest.",
    );
  }

  const current = currentSleeveQuantity(prints, event.ticker, event.sleeve);
  if (current == null) {
    throw new FillIngestError(
      `no seed quantity for ${event.ticker} ${event.sleeve}.`,
    );
  }

  const nextQuantity = applyQuantityDelta(current, event.side, event.qty);
  const nextTicker = {
    ...(prints[event.ticker] ?? {}),
    [event.sleeve]: nextQuantity,
  };
  delete nextTicker[FLARE_VAULT_SLEEVE_ID];

  return {
    prints: {
      ...prints,
      [event.ticker]: nextTicker,
    },
    applied: true,
    nextQuantity,
  };
}

export function mergeSleeveBook(
  ticker: LockedTicker | string,
  prints: SleevePrints,
  seed: readonly NodeSleeve[] = seedBookForTicker(ticker) ?? [],
): NodeSleeve[] {
  return seed.map((sleeve) => {
    if (sleeve.id === FLARE_VAULT_SLEEVE_ID || sleeve.manual) {
      return sleeve;
    }
    const override = prints[ticker]?.[sleeve.id];
    if (typeof override !== "string" || !override.trim()) return sleeve;
    return { ...sleeve, quantity: override.trim() };
  });
}

export function sanitizeSleevePrints(prints: SleevePrints): SleevePrints {
  const next: SleevePrints = {};
  for (const [ticker, rows] of Object.entries(prints)) {
    const clean: Record<string, string> = {};
    for (const [id, quantity] of Object.entries(rows ?? {})) {
      if (id === FLARE_VAULT_SLEEVE_ID) continue;
      const seed = findSeedSleeve(ticker, id);
      if (!seed || seed.manual) continue;
      if (typeof quantity !== "string" || !quantity.trim()) continue;
      clean[id] = quantity.trim();
    }
    if (Object.keys(clean).length > 0) next[ticker] = clean;
  }
  return next;
}
