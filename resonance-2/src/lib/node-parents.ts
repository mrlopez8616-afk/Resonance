import { FLOOR_NODES, type FloorNode } from "@/data/floor-nodes";
import {
  FIGHT_DESK_ID,
  NODE_PARENT,
  PARENTS,
  type ParentId,
} from "@/data/node-parents";
import type { FightDeskSummary } from "@/lib/bets";
import { removedNodes, visibleNodes } from "@/lib/floor-registry";
import { formatCompactUsd } from "@/lib/live-face";

export type FaceTotals = Readonly<Record<string, number | null | undefined>>;

export type ParentAggregate = {
  connected: boolean;
  childCount: number;
  /** Sum of painted child `totalUsd` values. Null when any painted child has no live USD. */
  liveUsd: number | null;
  liveUsdLabel: string | null;
  /** Fight Desk open count. Null when that summary is missing. */
  openBets: number | null;
};

const PARENT_BY_NODE: Readonly<Record<string, ParentId>> = NODE_PARENT;

export function parentById(id: string): (typeof PARENTS)[number] | null {
  return PARENTS.find((parent) => parent.id === id) ?? null;
}

export function nodeParent(nodeId: string): ParentId | null {
  return PARENT_BY_NODE[nodeId] ?? null;
}

export function floorNodesForParent(parentId: ParentId): FloorNode[] {
  return FLOOR_NODES.filter(
    (node) => node.status !== "empty" && nodeParent(node.id) === parentId,
  );
}

/** A parent owns floor squares when a catalog row (live or offline) maps to it. */
export function parentOwnsFloor(parentId: ParentId): boolean {
  return floorNodesForParent(parentId).length > 0;
}

/**
 * Connected means a home tile can stand here.
 * `flr` is mapped and still does not connect a parent, because it has no square.
 */
export function parentIsConnected(parentId: ParentId): boolean {
  if (nodeParent(FIGHT_DESK_ID) === parentId) return true;
  return parentOwnsFloor(parentId);
}

export function parentShowsFightDesk(parentId: ParentId): boolean {
  return nodeParent(FIGHT_DESK_ID) === parentId;
}

/** Child squares for one parent, in the same order the floor paints today. */
export function nodesOnParent(
  hiddenIds: readonly string[],
  parentId: ParentId,
): FloorNode[] {
  const ownsFloor = parentOwnsFloor(parentId);
  return visibleNodes(hiddenIds).filter((node) => {
    if (node.status === "empty") return ownsFloor;
    return nodeParent(node.id) === parentId;
  });
}

export function removedOnParent(
  hiddenIds: readonly string[],
  parentId: ParentId,
): FloorNode[] {
  return removedNodes(hiddenIds).filter((node) => nodeParent(node.id) === parentId);
}

export function paintedTickers(
  hiddenIds: readonly string[],
  parentId: ParentId,
): string[] {
  return nodesOnParent(hiddenIds, parentId)
    .filter((node) => node.status === "live")
    .map((node) => node.ticker);
}

/**
 * Sum existing live-face USD totals.
 * Returns null when there is nothing painted or any painted total is missing.
 */
export function sumLiveUsd(totals: FaceTotals, tickers: readonly string[]): number | null {
  if (tickers.length === 0) return null;
  let sum = 0;
  for (const ticker of tickers) {
    const usd = totals[ticker];
    if (typeof usd !== "number" || !Number.isFinite(usd)) return null;
    sum += usd;
  }
  return sum;
}

/** Home cards link straight to /fights. Other parents open their child-card page. */
export function parentCardHref(parentId: ParentId): string {
  if (parentId === "fights") return "/fights";
  return `/n/${parentId}`;
}

/** Live-face page for a floor node. FLR has no square, so it has no page. */
export function nodePageHref(ticker: string): string | null {
  const id = ticker.trim().toLowerCase();
  const node = FLOOR_NODES.find((item) => item.id === id && item.status !== "empty");
  if (!node) return null;
  const parentId = nodeParent(node.id);
  if (!parentId || parentId === "fights") return null;
  return `/n/${parentId}/${node.id}`;
}

/**
 * One real line for a parent card.
 * A complete live sum wins. Otherwise the fight desk's open count.
 * Otherwise the painted child count. Never more than one of these.
 */
export function parentSummaryLine(
  aggregate: ParentAggregate,
): { value: string; unit: string } | null {
  if (!aggregate.connected) return null;
  if (aggregate.liveUsdLabel !== null) {
    return { value: aggregate.liveUsdLabel, unit: "sum" };
  }
  if (aggregate.openBets !== null) {
    return { value: String(aggregate.openBets), unit: "open" };
  }
  return {
    value: String(aggregate.childCount),
    unit: aggregate.childCount === 1 ? "node" : "nodes",
  };
}

export function parentAggregate(
  parentId: ParentId,
  hiddenIds: readonly string[],
  faceTotals: FaceTotals,
  fightDesk: FightDeskSummary | null,
  fightDeskAvailability: "live" | "seed-only" | "unavailable",
): ParentAggregate {
  const painted = paintedTickers(hiddenIds, parentId);
  const showsFightDesk = parentShowsFightDesk(parentId);
  const liveUsd = sumLiveUsd(faceTotals, painted);
  const openBets =
    showsFightDesk && fightDesk && fightDeskAvailability !== "unavailable"
      ? fightDesk.open
      : null;
  return {
    connected: parentIsConnected(parentId),
    childCount: painted.length + (showsFightDesk ? 1 : 0),
    liveUsd,
    liveUsdLabel: liveUsd === null ? null : formatCompactUsd(liveUsd),
    openBets,
  };
}
