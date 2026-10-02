import type { NodeSleeve } from "@/data/sleeves";

/**
 * XLM sleeve quantities for the live crypto face.
 *
 * Robinhood Agentic position pull 2026-10-01: 0 XLM.
 * No open position. The 2026-09-29 lot (1910.31, cost basis $438.01)
 * was sold. Cost basis is not a sleeve field. Do not invent RH Main,
 * Coinbase, or vault lots. This brick does not call Robinhood.
 * The node stays on the floor.
 */

export type XlmSleeve = NodeSleeve;

export const XLM_AGENTIC_TOKENS = "0";

export const XLM_SLEEVES: XlmSleeve[] = [
  {
    id: "rh-agentic",
    label: "RH Agentic",
    quantity: XLM_AGENTIC_TOKENS,
    source: "robinhood-config",
    manual: false,
  },
];
