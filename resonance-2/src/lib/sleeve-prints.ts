import "server-only";

import type { NodeSleeve } from "@/data/sleeves";
import { SUI_SLEEVES } from "@/data/sui-sleeves";
import { XRP_SLEEVES } from "@/data/xrp-sleeves";
import { listFills } from "./fills";
import { loadFillsStore, liveSleevesFromEnvelope } from "./fills-store";

export async function loadLiveSleeveBooks(): Promise<{
  XRP: readonly NodeSleeve[];
  SUI: readonly NodeSleeve[];
}> {
  try {
    const loaded = await loadFillsStore();
    return {
      XRP: liveSleevesFromEnvelope(loaded.envelope, "XRP") ?? XRP_SLEEVES,
      SUI: liveSleevesFromEnvelope(loaded.envelope, "SUI") ?? SUI_SLEEVES,
    };
  } catch {
    return { XRP: XRP_SLEEVES, SUI: SUI_SLEEVES };
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
