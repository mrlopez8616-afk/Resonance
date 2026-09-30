import type { NodeSleeve } from "@/data/sleeves";

/**
 * XRP sleeve quantities for the live node face.
 *
 * This brick does not call Robinhood or Coinbase. Broker connectors belong
 * on the server in a later brick — never in a Client Component and never
 * behind NEXT_PUBLIC_*.
 *
 * 2026-09-30 founder confirmation:
 * - RH Agentic holds 51.601 XRP. Confirmed cost basis $72.99 is not a
 *   sleeve field; the face prints quantity only.
 * - RH Main 587.718 is gone. That lot moved into Agentic and was used
 *   to buy the XLM and HBAR. Do not put the line back.
 * - Coinbase 778.178708 is gone. The founder no longer holds that lot.
 *
 * Flare vault is a MANUAL founder entry only (`FLARE_VAULT_XRP`). Do not
 * display the Xaman gas wallet address. Do not treat this as a chain read.
 * Do not edit the vault constant from a broker pull.
 */

export const FLARE_VAULT_XRP = "28281";

export type XrpSleeve = NodeSleeve;

export const XRP_SLEEVES: XrpSleeve[] = [
  {
    id: "rh-agentic",
    label: "RH Agentic",
    quantity: "51.601",
    source: "robinhood-config",
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
