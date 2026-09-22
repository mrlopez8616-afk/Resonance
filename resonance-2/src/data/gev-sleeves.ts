import type { NodeSleeve } from "@/data/sleeves";

/**
 * GEV sleeve quantities for the live equity face.
 *
 * Hub live lock 2026-09-21: RH Agentic only, 0.002640 shares.
 * Do not invent RH Main, Coinbase, or vault lots. Units are shares,
 * not crypto tokens. No Robinhood calls in this brick.
 */

export type GevSleeve = NodeSleeve;

export const GEV_AGENTIC_SHARES = "0.002640";

export const GEV_SLEEVES: GevSleeve[] = [
  {
    id: "rh-agentic",
    label: "RH Agentic",
    quantity: GEV_AGENTIC_SHARES,
    source: "robinhood-config",
    manual: false,
  },
];
