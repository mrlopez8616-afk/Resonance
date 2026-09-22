export type FloorNodeStatus = "live" | "offline" | "empty";

export type FloorNode = {
  id: string;
  ticker: string;
  status: FloorNodeStatus;
  note?: string;
};

/**
 * Operator-floor roster. XRP, SUI, PWR, ETN, VRT, GEV, CEG, and HUBB are live
 * and paint on the homepage. BTC, ETH, and SOL stay here while offline and are
 * not painted until they are live. FLR is locked but has no floor square.
 * Do not attach price or sleeve data to the remaining offline tickers yet.
 */
export const FLOOR_NODES: FloorNode[] = [
  { id: "xrp", ticker: "XRP", status: "live" },
  { id: "sui", ticker: "SUI", status: "live" },
  { id: "pwr", ticker: "PWR", status: "live" },
  { id: "etn", ticker: "ETN", status: "live" },
  { id: "vrt", ticker: "VRT", status: "live" },
  { id: "gev", ticker: "GEV", status: "live" },
  { id: "ceg", ticker: "CEG", status: "live" },
  { id: "hubb", ticker: "HUBB", status: "live" },
  { id: "btc", ticker: "BTC", status: "offline" },
  { id: "eth", ticker: "ETH", status: "offline" },
  { id: "sol", ticker: "SOL", status: "offline" },
  { id: "slot", ticker: "+", status: "empty" },
];
