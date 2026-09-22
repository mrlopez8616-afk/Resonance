import type { NodeSleeve } from "@/data/sleeves";

/**
 * CEG sleeve quantities for the live equity face.
 *
 * Hub live lock 2026-09-21: RH Agentic only, 0.009617 shares.
 * Do not invent RH Main, Coinbase, or vault lots. Units are shares,
 * not crypto tokens. No Robinhood calls in this brick.
 */

export type CegSleeve = NodeSleeve;

export const CEG_AGENTIC_SHARES = "0.009617";

export const CEG_SLEEVES: CegSleeve[] = [
  {
    id: "rh-agentic",
    label: "RH Agentic",
    quantity: CEG_AGENTIC_SHARES,
    source: "robinhood-config",
    manual: false,
  },
];
