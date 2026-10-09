import type { FillSleeveId } from "@/data/fills";
import type { NodeSleeve } from "@/data/sleeves";
import { CEG_SLEEVES } from "@/data/ceg-sleeves";
import { ETN_SLEEVES } from "@/data/etn-sleeves";
import { GEV_SLEEVES } from "@/data/gev-sleeves";
import { HBAR_SLEEVES } from "@/data/hbar-sleeves";
import { HUBB_SLEEVES } from "@/data/hubb-sleeves";
import { NVDA_SLEEVES } from "@/data/nvda-sleeves";
import { PWR_SLEEVES } from "@/data/pwr-sleeves";
import { SPCX_SLEEVES } from "@/data/spcx-sleeves";
import { SUI_SLEEVES } from "@/data/sui-sleeves";
import { TSM_SLEEVES } from "@/data/tsm-sleeves";
import { TSLA_SLEEVES } from "@/data/tsla-sleeves";
import { VRT_SLEEVES } from "@/data/vrt-sleeves";
import { XRP_SLEEVES } from "@/data/xrp-sleeves";
import { addDecimal, isDecimalString, subtractDecimal } from "@/lib/decimal";
import {
  FLARE_VAULT_SLEEVE_ID,
  FillIngestError,
  type LockedTicker,
  type NormalizedFillEvent,
  type NormalizedTransferEvent,
} from "@/lib/fill-event";

export const LIVE_SLEEVE_SEEDS: Record<string, readonly NodeSleeve[]> = {
  XRP: XRP_SLEEVES,
  SUI: SUI_SLEEVES,
  PWR: PWR_SLEEVES,
  VRT: VRT_SLEEVES,
  GEV: GEV_SLEEVES,
  CEG: CEG_SLEEVES,
  NVDA: NVDA_SLEEVES,
  TSM: TSM_SLEEVES,
  TSLA: TSLA_SLEEVES,
  SPCX: SPCX_SLEEVES,
  ETN: ETN_SLEEVES,
  HUBB: HUBB_SLEEVES,
  HBAR: HBAR_SLEEVES,
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
  side: "buy" | "sell",
  qty: string,
): string {
  return side === "buy" ? addDecimal(current, qty) : subtractDecimal(current, qty);
}

function refuseManualSleeve(ticker: string, sleeveId: string): void {
  if (sleeveId === (FLARE_VAULT_SLEEVE_ID as unknown as FillSleeveId)) {
    throw new FillIngestError(
      "flare-vault is founder-entered only and cannot be written by ingest.",
    );
  }
  const seed = findSeedSleeve(ticker, sleeveId);
  if (!seed) {
    throw new FillIngestError(`sleeve ${sleeveId} is not on the ${ticker} face.`);
  }
  if (seed.id === FLARE_VAULT_SLEEVE_ID || seed.manual) {
    throw new FillIngestError(
      "manual / flare-vault sleeves cannot be written by ingest.",
    );
  }
}

/**
 * Move quantity from one sleeve to another in one step.
 * Refuses a source that would go below zero, and refuses manual / flare-vault.
 */
export function applyTransferToSleevePrints(
  prints: SleevePrints,
  event: NormalizedTransferEvent,
): { prints: SleevePrints; applied: boolean; fromQuantity: string | null; toQuantity: string | null } {
  if (
    event.fromSleeve === (FLARE_VAULT_SLEEVE_ID as unknown as FillSleeveId) ||
    event.toSleeve === (FLARE_VAULT_SLEEVE_ID as unknown as FillSleeveId)
  ) {
    throw new FillIngestError(
      "flare-vault is founder-entered only and cannot be written by ingest.",
    );
  }

  const book = seedBookForTicker(event.ticker);
  if (!book) {
    return { prints, applied: false, fromQuantity: null, toQuantity: null };
  }

  refuseManualSleeve(event.ticker, event.fromSleeve);
  refuseManualSleeve(event.ticker, event.toSleeve);

  const fromRaw = currentSleeveQuantity(prints, event.ticker, event.fromSleeve);
  const toRaw = currentSleeveQuantity(prints, event.ticker, event.toSleeve);
  if (fromRaw == null || toRaw == null) {
    throw new FillIngestError(
      `no seed quantity for ${event.ticker} ${fromRaw == null ? event.fromSleeve : event.toSleeve}.`,
    );
  }
  const fromCurrent = isDecimalString(fromRaw) ? fromRaw.trim() : "0";
  const toCurrent = isDecimalString(toRaw) ? toRaw.trim() : "0";
  const fromQuantity = subtractDecimal(fromCurrent, event.qty);
  if (fromQuantity.startsWith("-")) {
    throw new FillIngestError("transfer would take the source sleeve below zero.", 409);
  }
  const toQuantity = addDecimal(toCurrent, event.qty);
  const nextTicker = {
    ...(prints[event.ticker] ?? {}),
    [event.fromSleeve]: fromQuantity,
    [event.toSleeve]: toQuantity,
  };
  delete nextTicker[FLARE_VAULT_SLEEVE_ID];
  return {
    prints: {
      ...prints,
      [event.ticker]: nextTicker,
    },
    applied: true,
    fromQuantity,
    toQuantity,
  };
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
  if (event.kind === "transfer") {
    throw new FillIngestError("a transfer is applied with applyTransferToSleevePrints.");
  }
  if (event.kind === "reward") {
    throw new FillIngestError("a reward is not a trade and does not move a sleeve print.");
  }
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

  const currentRaw = currentSleeveQuantity(prints, event.ticker, event.sleeve);
  if (currentRaw == null) {
    throw new FillIngestError(
      `no seed quantity for ${event.ticker} ${event.sleeve}.`,
    );
  }
  // TBD / non-numeric seeds are honest placeholders, not lots. First fill
  // starts from 0 so the hub qty becomes the print.
  const current = isDecimalString(currentRaw) ? currentRaw.trim() : "0";

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
