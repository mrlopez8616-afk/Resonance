import type { NodeSleeve } from "@/data/sleeves";

/**
 * Seed SUI sleeves. The Coinbase and Coinbase Agentic quantities are the
 * fallback when a portfolio read has never been stored. A live read replaces
 * those two quantities and includes staked SUI. RH Agentic stays this print.
 * The Xaman vault and RH Main are not on this book.
 *
 * Hub live lock 2026-09-21: RH Agentic sold to 0. Leave that print.
 * The Coinbase seed is the filled-buy sum 16.9 + 16.8 = 33.7. A portfolio
 * breakdown replaces it when staked or spendable SUI is readable. Do not
 * replace either Coinbase line from a Robinhood pull.
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
