import { CRYPTO_TICKERS, EQUITY_TICKERS } from "./price-ids";
import type { AgenticIntent, Node, NodeSleeve } from "./types";

export const DIGITAL_TICKERS = CRYPTO_TICKERS;
export const PHYSICAL_AI_TICKERS = EQUITY_TICKERS;

/** Main Robinhood learning lots scheduled to flatten Monday (D-2026-09-11-01). */
export const MAIN_FLATTEN_TICKERS = [
  "CEG",
  "ETN",
  "PWR",
  "GEV",
  "HUBB",
  "VRT",
] as const;

export const ROBINHOOD_SNAPSHOT_AS_OF = "2026-09-11T16:10:00Z";

export interface SeedHolding {
  quantity: string;
  averageCost?: string;
  venue: string;
  sleeve: NodeSleeve;
  holdingsNote: string;
  lastSyncedAt: string;
  syncSource: string;
}

export const SEEDED_MAIN_HOLDINGS: Record<string, SeedHolding> = {
  CEG: {
    quantity: "0.027002",
    averageCost: "259.61",
    venue: "Robinhood",
    sleeve: "main",
    holdingsNote:
      "Main learning lot. Flatten Monday per D-2026-09-11-01 — queued, not filled. No silent Main trades.",
    lastSyncedAt: ROBINHOOD_SNAPSHOT_AS_OF,
    syncSource: "robinhood-snapshot",
  },
  ETN: {
    quantity: "0.041504",
    averageCost: "410.08",
    venue: "Robinhood",
    sleeve: "main",
    holdingsNote:
      "Main learning lot. Flatten Monday per D-2026-09-11-01 — queued, not filled. Agentic ETN is a separate D-04 sleeve.",
    lastSyncedAt: ROBINHOOD_SNAPSHOT_AS_OF,
    syncSource: "robinhood-snapshot",
  },
  PWR: {
    quantity: "0.070066",
    averageCost: "627.98",
    venue: "Robinhood",
    sleeve: "main",
    holdingsNote:
      "Main learning lot. Flatten Monday per D-2026-09-11-01 — queued, not filled. Agentic PWR $35 is a separate D-03 ticket.",
    lastSyncedAt: ROBINHOOD_SNAPSHOT_AS_OF,
    syncSource: "robinhood-snapshot",
  },
  GEV: {
    quantity: "0.030763",
    averageCost: "944.64",
    venue: "Robinhood",
    sleeve: "main",
    holdingsNote:
      "Main learning lot. Flatten Monday per D-2026-09-11-01 — queued, not filled. Agentic GEV is a separate D-04 sleeve.",
    lastSyncedAt: ROBINHOOD_SNAPSHOT_AS_OF,
    syncSource: "robinhood-snapshot",
  },
  HUBB: {
    quantity: "0.010088",
    averageCost: "470.86",
    venue: "Robinhood",
    sleeve: "main",
    holdingsNote:
      "Main learning lot. Flatten Monday per D-2026-09-11-01 — queued, not filled.",
    lastSyncedAt: ROBINHOOD_SNAPSHOT_AS_OF,
    syncSource: "robinhood-snapshot",
  },
  VRT: {
    quantity: "0.019260",
    averageCost: "259.61",
    venue: "Robinhood",
    sleeve: "main",
    holdingsNote:
      "Main learning lot. Flatten Monday per D-2026-09-11-01 — queued, not filled. Agentic VRT $17 is a separate D-03 ticket.",
    lastSyncedAt: ROBINHOOD_SNAPSHOT_AS_OF,
    syncSource: "robinhood-snapshot",
  },
  XRP: {
    quantity: "69.169",
    venue: "Robinhood",
    sleeve: "main",
    holdingsNote:
      "Robinhood Main XRP bag. Separate from Xaman / Flare-vault treasury principal. Cost basis ~18.85 USD on 16.334 direct qty; remainder may be transfers.",
    lastSyncedAt: ROBINHOOD_SNAPSHOT_AS_OF,
    syncSource: "robinhood-snapshot",
  },
};

export const LOCKED_AGENTIC_INTENTS: AgenticIntent[] = [
  {
    id: "agt-2026-09-11-pwr",
    ticker: "PWR",
    side: "buy",
    notionalUsd: 35,
    status: "queued",
    authorizedByDecisionId: "D-2026-09-11-03",
    note: "Agentic PWR $35 at Monday open. Queued ≠ filled. Does not touch Main or Xaman principal.",
    venue: "Robinhood",
  },
  {
    id: "agt-2026-09-11-vrt",
    ticker: "VRT",
    side: "buy",
    notionalUsd: 17,
    status: "queued",
    authorizedByDecisionId: "D-2026-09-11-03",
    note: "Agentic VRT $17 at Monday open. Queued ≠ filled. Does not touch Main or Xaman principal.",
    venue: "Robinhood",
  },
  {
    id: "agt-2026-09-11-etn",
    ticker: "ETN",
    side: "buy",
    notionalUsd: null,
    status: "queued",
    authorizedByDecisionId: "D-2026-09-11-04",
    note: "Agentic autonomy may trade ETN under D-04. QUEUED for Monday open — not filled. No silent Main trades.",
    venue: "Robinhood",
  },
  {
    id: "agt-2026-09-11-gev",
    ticker: "GEV",
    side: "buy",
    notionalUsd: null,
    status: "queued",
    authorizedByDecisionId: "D-2026-09-11-04",
    note: "Agentic autonomy may trade GEV under D-04. QUEUED for Monday open — not filled. No silent Main trades.",
    venue: "Robinhood",
  },
];

export function applySeedHolding(node: Node): Node {
  const holding = SEEDED_MAIN_HOLDINGS[node.ticker];
  if (!holding) {
    return {
      ...node,
      sleeve: node.sleeve ?? "none",
    };
  }
  return {
    ...node,
    status: "funded",
    quantity: holding.quantity,
    averageCost: holding.averageCost ?? node.averageCost,
    venue: holding.venue,
    lastSyncedAt: holding.lastSyncedAt,
    syncSource: holding.syncSource,
    holdingsNote: holding.holdingsNote,
    sleeve: holding.sleeve,
  };
}

export function nodesByClass(nodes: Node[], assetClass: Node["class"]): Node[] {
  return nodes.filter((node) => node.class === assetClass);
}

export function nodesBySleeve(nodes: Node[], sleeve: NodeSleeve): Node[] {
  return nodes.filter((node) => node.sleeve === sleeve);
}

export function mainLearningLots(nodes: Node[]): Node[] {
  return MAIN_FLATTEN_TICKERS.map((ticker) =>
    nodes.find((node) => node.ticker === ticker),
  ).filter((node): node is Node => Boolean(node));
}

export function digitalNodes(nodes: Node[]): Node[] {
  return DIGITAL_TICKERS.map((ticker) =>
    nodes.find((node) => node.ticker === ticker),
  ).filter((node): node is Node => Boolean(node));
}

export function physicalNodes(nodes: Node[]): Node[] {
  return PHYSICAL_AI_TICKERS.map((ticker) =>
    nodes.find((node) => node.ticker === ticker),
  ).filter((node): node is Node => Boolean(node));
}

export function queuedAgenticIntents(intents: AgenticIntent[]): AgenticIntent[] {
  return intents.filter((intent) => intent.status === "queued");
}

export function mergeAgenticIntentsById(
  existing: AgenticIntent[],
  incoming: AgenticIntent[],
): AgenticIntent[] {
  const byId = new Map<string, AgenticIntent>();
  for (const item of existing) byId.set(item.id, item);
  for (const item of incoming) {
    const prev = byId.get(item.id);
    byId.set(item.id, prev ? { ...prev, ...item } : item);
  }
  return Array.from(byId.values());
}

export function venueKind(
  venue: string,
): "robinhood" | "xaman" | "coinbase" | "metamask" | "other" {
  const normalized = venue.trim().toLowerCase();
  if (normalized.includes("robinhood")) return "robinhood";
  if (normalized.includes("xaman")) return "xaman";
  if (normalized.includes("coinbase")) return "coinbase";
  if (normalized.includes("metamask") || normalized.includes("meta mask")) {
    return "metamask";
  }
  return "other";
}
