import type { NodeSleeve } from "@/data/sleeves";

/**
 * HBAR sleeve quantities for the live crypto face.
 *
 * Robinhood Agentic position pull 2026-09-29: 3846.51 HBAR.
 * One filled buy. Do not invent RH Main, Coinbase, or vault lots.
 * This brick does not call Robinhood. The typed print is the fallback
 * until a hub POST applies.
 */

export type HbarSleeve = NodeSleeve;

export const HBAR_AGENTIC_TOKENS = "3846.51";

export const HBAR_SLEEVES: HbarSleeve[] = [
  {
    id: "rh-agentic",
    label: "RH Agentic",
    quantity: HBAR_AGENTIC_TOKENS,
    source: "robinhood-config",
    manual: false,
  },
];
