import type { NodeSleeve } from "@/data/sleeves";

/**
 * ETN sleeve quantities for the live equity face.
 *
 * Hub live lock 2026-09-21: RH Agentic only, 0.005844 shares.
 * Supersedes draft #34's 0.002374 and the TBD placeholder. The
 * 2026-09-11 snapshot 0.041504 is RH Main, not this sleeve. Do not
 * invent Main, Coinbase, or vault lots. Units are shares, not crypto
 * tokens. No Robinhood calls in this brick.
 */

export type EtnSleeve = NodeSleeve;

export const ETN_AGENTIC_SHARES = "0.005844";

export const ETN_SLEEVES: EtnSleeve[] = [
  {
    id: "rh-agentic",
    label: "RH Agentic",
    quantity: ETN_AGENTIC_SHARES,
    source: "robinhood-config",
    manual: false,
  },
];
