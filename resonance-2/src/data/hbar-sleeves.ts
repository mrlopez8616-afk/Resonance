import type { NodeSleeve } from "@/data/sleeves";

/**
 * HBAR sleeve quantities for the live crypto face.
 *
 * Robinhood Agentic position pull 2026-10-01: 7809.65 HBAR.
 * Cost basis $847.11 is not a sleeve field.
 * The 2026-09-29 buy is already inside this print, plus the
 * 2026-10-01 buy. Do not invent RH Main, Coinbase, or vault lots.
 * This brick does not call Robinhood. The typed print is the fallback
 * until a hub POST applies.
 */

export type HbarSleeve = NodeSleeve;

export const HBAR_AGENTIC_TOKENS = "7809.65";

export const HBAR_SLEEVES: HbarSleeve[] = [
  {
    id: "rh-agentic",
    label: "RH Agentic",
    quantity: HBAR_AGENTIC_TOKENS,
    source: "robinhood-config",
    manual: false,
  },
];
