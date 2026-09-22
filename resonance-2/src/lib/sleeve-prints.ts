import "server-only";

import type { NodeSleeve } from "@/data/sleeves";
import { CEG_SLEEVES } from "@/data/ceg-sleeves";
import { ETN_SLEEVES } from "@/data/etn-sleeves";
import { GEV_SLEEVES } from "@/data/gev-sleeves";
import { HUBB_SLEEVES } from "@/data/hubb-sleeves";
import { PWR_SLEEVES } from "@/data/pwr-sleeves";
import { SUI_SLEEVES } from "@/data/sui-sleeves";
import { VRT_SLEEVES } from "@/data/vrt-sleeves";
import { XRP_SLEEVES } from "@/data/xrp-sleeves";
import { listFills } from "./fills";
import { loadFillsStore, liveSleevesFromEnvelope } from "./fills-store";

export async function loadLiveSleeveBooks(): Promise<{
  XRP: readonly NodeSleeve[];
  SUI: readonly NodeSleeve[];
  PWR: readonly NodeSleeve[];
  ETN: readonly NodeSleeve[];
  VRT: readonly NodeSleeve[];
  GEV: readonly NodeSleeve[];
  CEG: readonly NodeSleeve[];
  HUBB: readonly NodeSleeve[];
}> {
  try {
    const loaded = await loadFillsStore();
    return {
      XRP: liveSleevesFromEnvelope(loaded.envelope, "XRP") ?? XRP_SLEEVES,
      SUI: liveSleevesFromEnvelope(loaded.envelope, "SUI") ?? SUI_SLEEVES,
      PWR: liveSleevesFromEnvelope(loaded.envelope, "PWR") ?? PWR_SLEEVES,
      ETN: liveSleevesFromEnvelope(loaded.envelope, "ETN") ?? ETN_SLEEVES,
      VRT: liveSleevesFromEnvelope(loaded.envelope, "VRT") ?? VRT_SLEEVES,
      GEV: liveSleevesFromEnvelope(loaded.envelope, "GEV") ?? GEV_SLEEVES,
      CEG: liveSleevesFromEnvelope(loaded.envelope, "CEG") ?? CEG_SLEEVES,
      HUBB: liveSleevesFromEnvelope(loaded.envelope, "HUBB") ?? HUBB_SLEEVES,
    };
  } catch {
    return {
      XRP: XRP_SLEEVES,
      SUI: SUI_SLEEVES,
      PWR: PWR_SLEEVES,
      ETN: ETN_SLEEVES,
      VRT: VRT_SLEEVES,
      GEV: GEV_SLEEVES,
      CEG: CEG_SLEEVES,
      HUBB: HUBB_SLEEVES,
    };
  }
}

export async function loadOperatorFills() {
  try {
    const loaded = await loadFillsStore();
    return {
      fills: listFills(loaded.envelope.fills),
      backend: loaded.backend,
      configured: loaded.configured,
    };
  } catch {
    return {
      fills: listFills(),
      backend: "none" as const,
      configured: false,
    };
  }
}
