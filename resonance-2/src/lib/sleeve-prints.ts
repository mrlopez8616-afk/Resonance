import "server-only";

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
import { listFills } from "./fills";
import { latestVaultAsOf, withVaultAsOf } from "./position-lots";
import { loadFillsStore, liveSleevesFromEnvelope, type FillsStoreBackend } from "./fills-store";
import { isStorageUnavailable, type StoreAvailability } from "@/lib/storage-unavailable";

export type SleeveBooks = {
  XRP: readonly NodeSleeve[];
  SUI: readonly NodeSleeve[];
  PWR: readonly NodeSleeve[];
  VRT: readonly NodeSleeve[];
  GEV: readonly NodeSleeve[];
  CEG: readonly NodeSleeve[];
  NVDA: readonly NodeSleeve[];
  TSM: readonly NodeSleeve[];
  TSLA: readonly NodeSleeve[];
  SPCX: readonly NodeSleeve[];
  ETN: readonly NodeSleeve[];
  HUBB: readonly NodeSleeve[];
  HBAR: readonly NodeSleeve[];
};

const SEED_BOOKS: SleeveBooks = {
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

function booksFromEnvelope(envelope: Parameters<typeof liveSleevesFromEnvelope>[0]): SleeveBooks {
  const vaultAsOf = latestVaultAsOf(listFills(envelope.fills));
  return {
    XRP: withVaultAsOf(liveSleevesFromEnvelope(envelope, "XRP") ?? XRP_SLEEVES, vaultAsOf),
    SUI: liveSleevesFromEnvelope(envelope, "SUI") ?? SUI_SLEEVES,
    PWR: liveSleevesFromEnvelope(envelope, "PWR") ?? PWR_SLEEVES,
    VRT: liveSleevesFromEnvelope(envelope, "VRT") ?? VRT_SLEEVES,
    GEV: liveSleevesFromEnvelope(envelope, "GEV") ?? GEV_SLEEVES,
    CEG: liveSleevesFromEnvelope(envelope, "CEG") ?? CEG_SLEEVES,
    NVDA: liveSleevesFromEnvelope(envelope, "NVDA") ?? NVDA_SLEEVES,
    TSM: liveSleevesFromEnvelope(envelope, "TSM") ?? TSM_SLEEVES,
    TSLA: liveSleevesFromEnvelope(envelope, "TSLA") ?? TSLA_SLEEVES,
    SPCX: liveSleevesFromEnvelope(envelope, "SPCX") ?? SPCX_SLEEVES,
    ETN: liveSleevesFromEnvelope(envelope, "ETN") ?? ETN_SLEEVES,
    HUBB: liveSleevesFromEnvelope(envelope, "HUBB") ?? HUBB_SLEEVES,
    HBAR: liveSleevesFromEnvelope(envelope, "HBAR") ?? HBAR_SLEEVES,
  };
}

export async function loadLiveSleeveBooks(): Promise<{
  books: SleeveBooks;
  status: "live" | "seed-only" | "unconfigured";
}> {
  try {
    const loaded = await loadFillsStore();
    if (!loaded.configured) {
      return { books: SEED_BOOKS, status: "unconfigured" };
    }
    return { books: booksFromEnvelope(loaded.envelope), status: "live" };
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    return { books: SEED_BOOKS, status: "seed-only" };
  }
}

export async function loadOperatorFills(): Promise<{
  fills: ReturnType<typeof listFills>;
  backend: FillsStoreBackend | "none";
  configured: boolean;
  status: Extract<StoreAvailability, "live" | "seed-only" | "unconfigured">;
}> {
  try {
    const loaded = await loadFillsStore();
    if (!loaded.configured) {
      return {
        fills: listFills(loaded.envelope.fills),
        backend: loaded.backend,
        configured: false,
        status: "unconfigured",
      };
    }
    return {
      fills: listFills(loaded.envelope.fills),
      backend: loaded.backend,
      configured: true,
      status: "live",
    };
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    return {
      fills: listFills(),
      backend: "none",
      configured: false,
      status: "seed-only",
    };
  }
}
