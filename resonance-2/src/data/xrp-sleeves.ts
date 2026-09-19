import type { NodeSleeve } from "@/data/sleeves";

/**
 * XRP sleeve quantities for the live node face.
 *
 * This brick does not call Robinhood or Coinbase. Broker connectors belong
 * on the server in a later brick — never in a Client Component and never
 * behind NEXT_PUBLIC_*. Quantities below are the last known live prints
 * (2026-09 Resonance check) used as typed placeholders so the face can
 * render without inventing fluctuating positions.
 *
 * Flare vault is a MANUAL founder entry only. Do not display the Xaman
 * gas wallet address. Do not treat this as a chain read.
 */

export const FLARE_VAULT_XRP = "28273";

export type XrpSleeve = NodeSleeve;

export const XRP_SLEEVES: XrpSleeve[] = [
  {
    id: "rh-main",
    label: "RH Main",
    quantity: "587.718",
    source: "robinhood-config",
    manual: false,
  },
  {
    id: "rh-agentic",
    label: "RH Agentic",
    quantity: "51.601",
    source: "robinhood-config",
    manual: false,
  },
  {
    id: "coinbase",
    label: "Coinbase",
    // Default wallet is readable via Coinbase API when server env exists.
    // No Coinbase credentials are wired in this Vercel app yet — stub.
    quantity: "778.178708",
    source: "coinbase-config",
    manual: false,
  },
  {
    id: "flare-vault",
    label: "Flare vault",
    quantity: FLARE_VAULT_XRP,
    source: "manual",
    manual: true,
  },
];
