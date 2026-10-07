/**
 * Home-node id → parent id.
 * Remap a node by editing its one line. Parent ids are listed on `PARENTS`.
 *
 * Floor ids match `FLOOR_NODES`. `fight-desk` marks the Predictions parent.
 * `flr` is locked and has no floor square — it stays mapped and is never painted.
 */

export const PARENTS = [
  { id: "crypto", label: "Crypto" },
  { id: "ai-stocks", label: "AI Stocks" },
  { id: "fitness", label: "Fitness" },
  { id: "finance", label: "Finance" },
  { id: "predictions", label: "Predictions" },
] as const;

export type ParentId = (typeof PARENTS)[number]["id"];

export const FIGHT_DESK_ID = "fight-desk";

export const NODE_PARENT = {
  xrp: "crypto",
  sui: "crypto",
  hbar: "crypto",
  btc: "crypto",
  eth: "crypto",
  sol: "crypto",
  flr: "crypto",
  pwr: "ai-stocks",
  etn: "ai-stocks",
  vrt: "ai-stocks",
  gev: "ai-stocks",
  ceg: "ai-stocks",
  hubb: "ai-stocks",
  [FIGHT_DESK_ID]: "predictions",
} as const satisfies Record<string, ParentId>;

/** Old parent slugs. They redirect at the parent route; they are not parents. */
export const LEGACY_PARENT_SLUGS = {
  ai: "ai-stocks",
  stocks: "ai-stocks",
  money: "finance",
  fights: "predictions",
} as const;
