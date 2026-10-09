import type { NodeSleeve } from "@/data/sleeves";

/**
 * HBAR sleeve book. The founder holds none, so the seed quantity is 0
 * and HBAR is not a floor node. The 2026-09-29 and 2026-10-01 buys stay
 * on the operator log. A later rh-agentic fill can still post.
 * Do not invent RH Main, Coinbase, or a vault line.
 */

export type HbarSleeve = NodeSleeve;

export const HBAR_AGENTIC_TOKENS = "0";

export const HBAR_SLEEVES: HbarSleeve[] = [
  {
    id: "rh-agentic",
    label: "RH Agentic",
    quantity: HBAR_AGENTIC_TOKENS,
    source: "robinhood-config",
    manual: false,
  },
];
