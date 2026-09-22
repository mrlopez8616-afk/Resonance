export type FloorNodeStatus = "live" | "offline" | "empty";

export type FloorNode = {
  id: string;
  ticker: string;
  status: FloorNodeStatus;
  note?: string;
};

/**
 * Operator-floor squares. XRP, SUI, PWR, ETN, and VRT are live in this brick.
 * Do not attach price or sleeve data to the remaining offline tickers yet.
 */
export const FLOOR_NODES: FloorNode[] = [
  { id: "xrp", ticker: "XRP", status: "live" },
  { id: "sui", ticker: "SUI", status: "live" },
  { id: "pwr", ticker: "PWR", status: "live" },
  { id: "etn", ticker: "ETN", status: "live" },
  { id: "vrt", ticker: "VRT", status: "live" },
  { id: "gev", ticker: "GEV", status: "offline" },
  { id: "ceg", ticker: "CEG", status: "offline" },
  { id: "hubb", ticker: "HUBB", status: "offline" },
  { id: "btc", ticker: "BTC", status: "offline" },
  { id: "eth", ticker: "ETH", status: "offline" },
  { id: "sol", ticker: "SOL", status: "offline" },
  { id: "slot", ticker: "+", status: "empty" },
];
