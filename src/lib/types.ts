export type Provenance = "verified" | "founder-reported" | "unverified";

export type AssetClass = "digital" | "physical";

export type PositionStatus = "none" | "watch" | "funded";

export type LedgerClassification = "principal" | "reward" | "fee" | "transfer";

export type DecisionStatus = "pending" | "decided";

export interface Treasury {
  units: number;
  asset: "XRP";
  venue: string;
  locationNote: string;
  estimatedDailyReward: number;
  /** Operator-typed XRP/USD. Used for Est. USD when no live print exists. Never fabricated. */
  manualUsdPerXrp: number | null;
  provenance: Provenance;
  updatedAt: string;
}

export interface Venue {
  id: string;
  name: string;
  role: string;
  notes: string;
}

export type NodeLinkKind = "funds" | "depends-on" | "related";

/** Directed edge for a later systems map. Unused in Phase Zero UI. */
export interface NodeLink {
  targetTicker: string;
  kind: NodeLinkKind;
  note: string;
}

export interface Node {
  id: string;
  ticker: string;
  name: string;
  class: AssetClass;
  thesis: string;
  failureCondition: string;
  status: PositionStatus;
  manualPriceUsd: number | null;
  manualPriceUpdatedAt: string | null;
  /** Fractional or whole size. String preserves snapshot precision. */
  quantity: number | string | null;
  /** Average cost per unit in USD. String preserves snapshot precision. */
  averageCost: number | string | null;
  /** Custody / brokerage venue for this node holding (not treasury). */
  venue: string;
  lastSyncedAt: string | null;
  /** e.g. robinhood-snapshot. Never implies a live brokerage session. */
  syncSource: string | null;
  holdingsNote: string;
  links: NodeLink[];
}

export type SnapshotAssetClass = "equity" | "crypto";

export type SnapshotHoldingTarget = "node" | "treasury";

export interface HoldingsSnapshotHolding {
  symbol: string;
  assetClass?: SnapshotAssetClass | string;
  quantity: number | string;
  averageCost?: number | string;
  venue?: string;
  note?: string;
  /** Default `node`. RH XRP must stay on the node, not Xaman treasury. */
  target?: SnapshotHoldingTarget;
}

export interface HoldingsSnapshot {
  asOf: string;
  source: string;
  holdings: HoldingsSnapshotHolding[];
}

export interface LedgerEntry {
  id: string;
  date: string;
  amount: number;
  fee: number;
  note: string;
  classification: LedgerClassification;
  applyToBalance: boolean;
  createdAt: string;
}

export interface Decision {
  id: string;
  question: string;
  options: string;
  status: DecisionStatus;
  decision: string;
  date: string;
  createdAt: string;
}

export interface Settings {
  operatorName: string;
  operatingPriority: string;
  xrplWatchAddress: string;
  showYoutubeStub: boolean;
}

export interface AppState {
  version: number;
  treasury: Treasury;
  venues: Venue[];
  nodes: Node[];
  ledger: LedgerEntry[];
  decisions: Decision[];
  settings: Settings;
}

export interface Quote {
  ticker: string;
  usd: number;
  change24hPct: number | null;
}

export interface PriceBook {
  fetchedAt: string | null;
  crypto: {
    source: string | null;
    status: "idle" | "loading" | "ok" | "error";
    error: string | null;
    quotes: Record<string, Quote>;
  };
  equities: {
    source: string | null;
    status: "idle" | "loading" | "ok" | "error";
    error: string | null;
    quotes: Record<string, Quote>;
  };
}

export const STATE_VERSION = 1;
export const STORAGE_KEY = "resonance.phase-zero.v1";
