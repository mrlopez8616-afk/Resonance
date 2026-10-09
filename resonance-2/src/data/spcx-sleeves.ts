import type { NodeSleeve } from "@/data/sleeves";

/**
 * SPCX sleeve book (SpaceX, Nasdaq). RH Agentic only.
 * Quantity starts at 0. Shares arrive through POST /api/fills.
 * Do not invent RH Main, Coinbase, or a vault lot. Units are shares.
 */

export const SPCX_SLEEVES: NodeSleeve[] = [
  {
    id: "rh-agentic",
    label: "RH Agentic",
    quantity: "0",
    source: "robinhood-config",
    manual: false,
  },
];
