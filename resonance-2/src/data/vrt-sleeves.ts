import type { NodeSleeve } from "@/data/sleeves";

/**
 * VRT sleeve quantities for the live equity face.
 *
 * Hub live lock 2026-09-21: RH Agentic only, 0.009991 shares.
 * Do not invent RH Main, Coinbase, or vault lots. Units are shares,
 * not crypto tokens. No Robinhood calls in this brick.
 */

export type VrtSleeve = NodeSleeve;

export const VRT_AGENTIC_SHARES = "0.009991";

export const VRT_SLEEVES: VrtSleeve[] = [
  {
    id: "rh-agentic",
    label: "RH Agentic",
    quantity: VRT_AGENTIC_SHARES,
    source: "robinhood-config",
    manual: false,
  },
];
