import type { NodeSleeve } from "@/data/sleeves";

/**
 * HBAR sleeve quantities for the live crypto face.
 *
 * Robinhood Agentic position pull 2026-10-01: 7847.91 HBAR.
 * Cost basis $851.06 is not a sleeve field.
 * The 2026-09-29 buy and the two 2026-10-01 buys are already
 * inside this print. Do not invent RH Main, Coinbase, or vault lots.
 * This brick does not call Robinhood. The typed print is the fallback
 * until a hub POST applies.
 */

export type HbarSleeve = NodeSleeve;

export const HBAR_AGENTIC_TOKENS = "7847.91";

export const HBAR_SLEEVES: HbarSleeve[] = [
  {
    id: "rh-agentic",
    label: "RH Agentic",
    quantity: HBAR_AGENTIC_TOKENS,
    source: "robinhood-config",
    manual: false,
  },
];
