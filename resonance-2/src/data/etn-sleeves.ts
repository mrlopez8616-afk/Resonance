import type { NodeSleeve } from "@/data/sleeves";

/**
 * ETN sleeve quantities for the live equity face.
 *
 * RH Agentic only. Last-known Agentic qty is TBD — no live/last-known
 * Agentic fill in repo, docs, or the operator log (D-04 queued ETN with
 * notionalUsd null; queued ≠ filled). The 2026-09-11 snapshot 0.041504
 * is RH Main, not this sleeve. Do not invent a fake lot. Units are
 * shares, not crypto tokens. No Robinhood calls in this brick.
 */

export type EtnSleeve = NodeSleeve;

/** Honest placeholder. Not a filled print. Face shows TBD until ingest. */
export const ETN_AGENTIC_SHARES = "TBD";

export const ETN_SLEEVES: EtnSleeve[] = [
  {
    id: "rh-agentic",
    label: "RH Agentic",
    quantity: ETN_AGENTIC_SHARES,
    source: "robinhood-config",
    manual: false,
  },
];
