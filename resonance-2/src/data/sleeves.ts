export type SleeveSource =
  | "robinhood-config"
  | "coinbase-config"
  | "manual";

/**
 * One sleeve row on a live node face.
 * `quantity` is a typed last-known print (string so it stays exact).
 * `note` is optional copy (not a second number). SUI Coinbase shows a clean qty.
 */
export type NodeSleeve = {
  id: string;
  label: string;
  quantity: string;
  source: SleeveSource;
  /** Founder-typed; not a broker or chain print. */
  manual: boolean;
  note?: string;
};
