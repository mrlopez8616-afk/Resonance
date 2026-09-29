import type { NodeSleeve } from "@/data/sleeves";

/**
 * XLM sleeve quantities for the live crypto face.
 *
 * Robinhood Agentic position pull 2026-09-29: 1910.31 XLM.
 * Two filled buys (1891.36 then 18.95). The sleeve print is the
 * position, not a replay of either fill. Do not invent RH Main,
 * Coinbase, or vault lots. This brick does not call Robinhood.
 */

export type XlmSleeve = NodeSleeve;

export const XLM_AGENTIC_TOKENS = "1910.31";

export const XLM_SLEEVES: XlmSleeve[] = [
  {
    id: "rh-agentic",
    label: "RH Agentic",
    quantity: XLM_AGENTIC_TOKENS,
    source: "robinhood-config",
    manual: false,
  },
];
