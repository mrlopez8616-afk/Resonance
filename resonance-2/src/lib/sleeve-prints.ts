import "server-only";

import type { NodeSleeve } from "@/data/sleeves";
import { ETN_SLEEVES } from "@/data/etn-sleeves";
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
}> {
  try {
    const loaded = await loadFillsStore();
    return {
      XRP: liveSleevesFromEnvelope(loaded.envelope, "XRP") ?? XRP_SLEEVES,
      SUI: liveSleevesFromEnvelope(loaded.envelope, "SUI") ?? SUI_SLEEVES,
      PWR: liveSleevesFromEnvelope(loaded.envelope, "PWR") ?? PWR_SLEEVES,
      ETN: liveSleevesFromEnvelope(loaded.envelope, "ETN") ?? ETN_SLEEVES,
      VRT: liveSleevesFromEnvelope(loaded.envelope, "VRT") ?? VRT_SLEEVES,
    };
  } catch {
    return {
      XRP: XRP_SLEEVES,
      SUI: SUI_SLEEVES,
      PWR: PWR_SLEEVES,
      ETN: ETN_SLEEVES,
      VRT: VRT_SLEEVES,
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
