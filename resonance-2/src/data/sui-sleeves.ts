import type { NodeSleeve } from "@/data/sleeves";

/**
 * SUI sleeve quantities for the live node face.
 *
 * Same rule as XRP: no Robinhood / Coinbase calls in this brick. Quantities
 * are last-known live prints (2026-09-19 CT Resonance check). Do not invent
 * a Coinbase lot — spendable balance is 0 (likely staked / unavailable).
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
    quantity: "0",
    source: "coinbase-config",
    manual: false,
    note: "staked/unavailable",
  },
];
