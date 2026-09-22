import type { NodeSleeve } from "@/data/sleeves";

/**
 * PWR sleeve quantities for the live equity face.
 *
 * Hub live lock 2026-09-21: RH Agentic only, 0.003917 shares.
 * Supersedes the 2026-09-19 print 0.001578. Do not invent RH Main,
 * Coinbase, or vault lots. Units are shares, not crypto tokens.
 * No Robinhood calls in this brick.
 */

export type PwrSleeve = NodeSleeve;

export const PWR_AGENTIC_SHARES = "0.003917";

export const PWR_SLEEVES: PwrSleeve[] = [
  {
    id: "rh-agentic",
    label: "RH Agentic",
    quantity: PWR_AGENTIC_SHARES,
    source: "robinhood-config",
    manual: false,
  },
];
