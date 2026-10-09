export type FloorNodeStatus = "live" | "offline" | "empty";

export type FloorNode = {
  id: string;
  ticker: string;
  status: FloorNodeStatus;
  note?: string;
};

/**
 * Operator-floor roster. Live crypto children are XRP and SUI. HBAR left
 * the roster; its sleeve book stays at 0 and `/n/crypto/hbar` redirects
 * to Crypto. Live AI Stocks children are PWR, VRT, GEV, CEG, NVDA, TSM,
 * TSLA, and SPCX. ETN and HUBB are retired from this roster; their sleeve
 * books and fills stay. BTC, ETH, and SOL stay here while offline and are
 * not painted until they are live. FLR is locked but has no floor square.
 * XLM is not a floor node. Do not attach price or sleeve data to the
 * remaining offline tickers yet.
 */
export const FLOOR_NODES: FloorNode[] = [
  { id: "xrp", ticker: "XRP", status: "live" },
  { id: "sui", ticker: "SUI", status: "live" },
  { id: "pwr", ticker: "PWR", status: "live" },
  { id: "vrt", ticker: "VRT", status: "live" },
  { id: "gev", ticker: "GEV", status: "live" },
  { id: "ceg", ticker: "CEG", status: "live" },
  { id: "nvda", ticker: "NVDA", status: "live" },
  { id: "tsm", ticker: "TSM", status: "live" },
  { id: "tsla", ticker: "TSLA", status: "live" },
  { id: "spcx", ticker: "SPCX", status: "live" },
  { id: "btc", ticker: "BTC", status: "offline" },
  { id: "eth", ticker: "ETH", status: "offline" },
  { id: "sol", ticker: "SOL", status: "offline" },
  { id: "slot", ticker: "+", status: "empty" },
];
