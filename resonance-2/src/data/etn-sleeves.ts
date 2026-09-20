import type { NodeSleeve } from "@/data/sleeves";

/**
 * ETN sleeve quantities for the live equity face.
 *
 * Founder / hub lock 2026-09-20: RH Agentic only, 0.002374 shares
 * (account ••••0757). RH Main equities were empty on that read —
 * do not invent Main as Agentic. The 2026-09-11 snapshot 0.041504
 * was RH Main and is not this sleeve. Units are shares, not crypto
 * tokens. No Robinhood calls in this brick.
 */

export type EtnSleeve = NodeSleeve;

export const ETN_AGENTIC_SHARES = "0.002374";

export const ETN_SLEEVES: EtnSleeve[] = [
  {
    id: "rh-agentic",
    label: "RH Agentic",
    quantity: ETN_AGENTIC_SHARES,
    source: "robinhood-config",
    manual: false,
  },
];
