/**
 * Home-node id → parent id.
 * Remap a node by editing its one line. Parent ids are listed on `PARENTS`.
 *
 * Floor ids match `FLOOR_NODES`. `fight-desk` is the home Fight Desk tile.
 * `flr` is locked and has no floor square — it stays mapped and is never painted.
 */

export const PARENTS = [
  { id: "crypto", label: "Crypto" },
  { id: "ai", label: "AI" },
  { id: "stocks", label: "Stocks" },
  { id: "fitness", label: "Fitness" },
  { id: "money", label: "Money" },
  { id: "fights", label: "Fights" },
] as const;

export type ParentId = (typeof PARENTS)[number]["id"];

export const FIGHT_DESK_ID = "fight-desk";

export const NODE_PARENT = {
  // Founder to confirm. Digital rail and a crypto face. Seed thesis also calls this the operating treasury rail.
  xrp: "crypto",
  sui: "crypto",
  hbar: "crypto",
  btc: "crypto",
  eth: "crypto",
  sol: "crypto",
  // Founder to confirm. Digital rail. Locked, and the cabinet says it has no floor square.
  flr: "crypto",
  // Founder to confirm. Node world labels these Physical AI. Cabinet faces call them US equity.
  pwr: "ai",
  etn: "ai",
  vrt: "ai",
  gev: "ai",
  ceg: "ai",
  hubb: "ai",
  [FIGHT_DESK_ID]: "fights",
} as const satisfies Record<string, ParentId>;
