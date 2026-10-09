import type { NodeSleeve } from "@/data/sleeves";

/**
 * SUI sleeve quantities for the live node face.
 *
 * Same rule as XRP: no Robinhood / Coinbase calls in this brick. Quantities
 * are last-known live prints. Do not invent a Coinbase lot beyond the
 * filled-buy sum below.
 *
 * Hub live lock 2026-09-21: RH Agentic sold to 0. The 2026-09-30
 * Agentic pull still has no SUI position, so the zero stays.
 * Coinbase Advanced Trade
 * (2026-09-19): SUI available=0 hold=0 (staking not on this API key). Use
 * the sum of SUI-USD FILLED buys instead: 16.9 + 16.8 = 33.7. Sells on
 * this book: none. Keep 33.7. Do not replace it from the Robinhood pull.
 * Flag that Coinbase line for hub confirmation.
 *
 * Coinbase Agentic (`cb-agentic`) starts at 0. A live buy is the first
 * print. A zero sleeve is hidden on the face while another sleeve is positive.
 *
 * No Flare vault line. Never show an Xaman / gas wallet address.
 */

export type SuiSleeve = NodeSleeve;

export const SUI_SLEEVES: SuiSleeve[] = [
  {
    id: "rh-agentic",
    label: "RH Agentic",
    quantity: "0",
    source: "robinhood-config",
    manual: false,
  },
  {
    id: "coinbase",
    label: "Coinbase",
    quantity: "33.7",
    source: "coinbase-config",
    manual: false,
  },
  {
    id: "cb-agentic",
    label: "Coinbase Agentic",
    quantity: "0",
    source: "coinbase-config",
    manual: false,
  },
];
