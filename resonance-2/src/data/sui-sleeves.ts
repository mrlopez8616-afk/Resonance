import type { NodeSleeve } from "@/data/sleeves";

/**
 * SUI sleeve quantities for the live node face.
 *
 * Same rule as XRP: no Robinhood / Coinbase calls in this brick. Quantities
 * are last-known live prints (2026-09-19 CT Resonance check). Do not invent
 * a Coinbase lot beyond the filled-buy sum below.
 *
 * Coinbase Advanced Trade (2026-09-19): SUI available=0 hold=0 (staking not
 * on this API key). Use the sum of SUI-USD FILLED buys instead:
 * 16.9 + 16.8 = 33.7. Sells on this book: none.
 *
 * No Flare vault line. Never show an Xaman / gas wallet address.
 */

export type SuiSleeve = NodeSleeve;

export const SUI_SLEEVES: SuiSleeve[] = [
  {
    id: "rh-agentic",
    label: "RH Agentic",
    quantity: "8.931",
    source: "robinhood-config",
    manual: false,
  },
  {
    id: "coinbase",
    label: "Coinbase",
    quantity: "33.7",
    source: "coinbase-config",
    manual: false,
    note: "buy print / staked",
  },
];
