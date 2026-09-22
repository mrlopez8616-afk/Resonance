import type { NodeSleeve } from "@/data/sleeves";

/**
 * HUBB sleeve quantities for the live equity face.
 *
 * Hub live lock 2026-09-21: RH Agentic only, 0.005566 shares.
 * Do not invent RH Main, Coinbase, or vault lots. Units are shares,
 * not crypto tokens. No Robinhood calls in this brick.
 */

export type HubbSleeve = NodeSleeve;

export const HUBB_AGENTIC_SHARES = "0.005566";

export const HUBB_SLEEVES: HubbSleeve[] = [
  {
    id: "rh-agentic",
    label: "RH Agentic",
    quantity: HUBB_AGENTIC_SHARES,
    source: "robinhood-config",
    manual: false,
  },
];
