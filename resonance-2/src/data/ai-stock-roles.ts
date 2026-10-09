import { AI_STOCK_TICKERS, type AiStockTicker } from "@/lib/ai-stocks";

/** Founder-reviewed one-liners. Static copy. Not a price and not a forecast. */
export const AI_STOCK_ROLES: Record<AiStockTicker, string> = {
  PWR: "Quanta Services builds and upgrades the grid and transmission lines that connect data centers to power.",
  VRT: "Vertiv makes the power and liquid-cooling equipment inside AI data centers.",
  GEV: "GE Vernova supplies gas turbines and grid equipment that generate and move power for data centers.",
  CEG: "Constellation runs the largest US nuclear fleet and sells carbon-free power to hyperscalers.",
  NVDA: "Nvidia designs the GPUs and networking that train and run AI models.",
  TSM: "TSMC manufactures most of the world's leading-edge AI chips, including Nvidia's.",
  TSLA: "Tesla builds EVs, Megapack energy storage, and the self-driving and Optimus robot AI.",
  SPCX: "SpaceX runs rockets and Starlink and owns xAI, the maker of Grok.",
};

export function aiStockRole(ticker: string): string | null {
  const upper = ticker.trim().toUpperCase();
  if (!(AI_STOCK_TICKERS as readonly string[]).includes(upper)) return null;
  return AI_STOCK_ROLES[upper as AiStockTicker];
}
