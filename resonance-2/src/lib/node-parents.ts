import { FLOOR_NODES, type FloorNode } from "@/data/floor-nodes";
import {
  FIGHT_DESK_ID,
  LEGACY_PARENT_SLUGS,
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
  /**
   * Sum of painted children that already have a real `totalUsd`.
   * Null when none of them do. A partial sum is not a complete sum.
   */
  liveUsd: number | null;
  liveUsdLabel: string | null;
  /** Painted children whose `totalUsd` is a finite number, including a real zero. */
  valuedCount: number;
  /** Painted live children. Hidden and offline rows are not in this count. */
  paintedCount: number;
  /** Open bet count for the Fight Desk parent. Null when that summary is missing. */
  openBets: number | null;
};

export type LiveUsdCoverage = {
  usd: number | null;
  valued: number;
  painted: number;
};

const PARENT_BY_NODE: Readonly<Record<string, ParentId>> = NODE_PARENT;

const CRYPTO_TICKERS = new Set(
  Object.entries(NODE_PARENT)
    .filter(([, parentId]) => parentId === "crypto")
    .map(([id]) => id.toUpperCase()),
);

/**
 * A sold crypto book prints ~$0.00. Hide that card and leave the config in place.
 * A fraction of a cent uses the same dollar print as an exact zero.
 */
export function isZeroCryptoHolding(
  ticker: string,
  totalUsd: number | null | undefined,
): boolean {
  if (!CRYPTO_TICKERS.has(ticker.toUpperCase())) return false;
  if (typeof totalUsd !== "number" || !Number.isFinite(totalUsd)) return false;
  return formatCompactUsd(totalUsd) === "~$0.00";
}

export function parentById(id: string): (typeof PARENTS)[number] | null {
  return PARENTS.find((parent) => parent.id === id) ?? null;
}

const NODE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Old `/n/ai`, `/n/stocks`, `/n/money`, `/n/fights`, and `/n/predictions` routes.
 * A child that still belongs to the replacement parent keeps its node path.
 * `/n/predictions/...` keeps every subpath, including bankroll.
 */
export function legacyParentHref(slug: string, nodeId?: string): string | null {
  const next = LEGACY_PARENT_SLUGS[slug as keyof typeof LEGACY_PARENT_SLUGS];
  if (!next) return null;
  if (slug === "predictions" && nodeId && NODE_SLUG.test(nodeId)) return `/n/${next}/${nodeId}`;
  if (nodeId && nodeParent(nodeId) === next) return `/n/${next}/${nodeId}`;
  return `/n/${next}`;
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
 * Sum the painted children that already have a real live-face USD total.
 * Children with no total stay out of the sum and out of `valued`.
 */
export function sumLiveUsd(
  totals: FaceTotals,
  tickers: readonly string[],
): LiveUsdCoverage {
  let usd = 0;
  let valued = 0;
  for (const ticker of tickers) {
    const value = totals[ticker];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    usd += value;
    valued += 1;
  }
  return {
    usd: valued === 0 ? null : usd,
    valued,
    painted: tickers.length,
  };
}

/** Home cards open the parent page. Fight Desk is /n/fight-desk. */
export function parentCardHref(parentId: ParentId): string {
  return `/n/${parentId}`;
}

/** Live-face page for a floor node. FLR has no square, so it has no page. */
export function nodePageHref(ticker: string): string | null {
  const id = ticker.trim().toLowerCase();
  const node = FLOOR_NODES.find((item) => item.id === id && item.status !== "empty");
  if (!node) return null;
  const parentId = nodeParent(node.id);
  if (!parentId || parentId === "fight-desk") return null;
  return `/n/${parentId}/${node.id}`;
}

export type ParentSummaryLine = {
  value: string;
  unit: string;
  /** True when the line names how many children actually have a value. */
  coverage: boolean;
};

/**
 * One real line for a holding parent.
 * A complete live sum says "sum". A partial sum names the coverage
 * ("value of 4 of 6") and is never presented as the whole book.
 * Fight Desk is a bankroll card and does not use this line.
 */
export function parentSummaryLine(aggregate: ParentAggregate): ParentSummaryLine | null {
  if (!aggregate.connected || aggregate.paintedCount === 0) return null;
  if (
    aggregate.liveUsdLabel !== null &&
    aggregate.valuedCount === aggregate.paintedCount
  ) {
    return { value: aggregate.liveUsdLabel, unit: "sum", coverage: false };
  }
  if (
    aggregate.liveUsdLabel !== null &&
    aggregate.valuedCount > 0 &&
    aggregate.valuedCount < aggregate.paintedCount
  ) {
    return {
      value: aggregate.liveUsdLabel,
      unit: `value of ${aggregate.valuedCount} of ${aggregate.paintedCount}`,
      coverage: true,
    };
  }
  if (aggregate.valuedCount === 0) {
    return {
      value: `value of 0 of ${aggregate.paintedCount}`,
      unit: "",
      coverage: true,
    };
  }
  return null;
}

export function parentAggregate(
  parentId: ParentId,
  hiddenIds: readonly string[],
  faceTotals: FaceTotals,
  fightDesk: FightDeskSummary | null,
  fightDeskAvailability: "live" | "seed-only" | "unavailable",
): ParentAggregate {
  const painted = paintedTickers(hiddenIds, parentId).filter(
    (ticker) => !isZeroCryptoHolding(ticker, faceTotals[ticker]),
  );
  const showsFightDesk = parentShowsFightDesk(parentId);
  const coverage = sumLiveUsd(faceTotals, painted);
  const openBets =
    showsFightDesk && fightDesk && fightDeskAvailability !== "unavailable"
      ? fightDesk.open
      : null;
  return {
    connected: parentIsConnected(parentId),
    childCount: painted.length + (showsFightDesk ? 1 : 0),
    liveUsd: coverage.usd,
    liveUsdLabel: coverage.usd === null ? null : formatCompactUsd(coverage.usd),
    valuedCount: coverage.valued,
    paintedCount: coverage.painted,
    openBets,
  };
}
