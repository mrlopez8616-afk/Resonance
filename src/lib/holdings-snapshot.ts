import type {
  AppState,
  HoldingsSnapshot,
  HoldingsSnapshotHolding,
  Node,
  PositionStatus,
  SnapshotHoldingTarget,
} from "./types";
import { holdingToNumber } from "./format";
import { SEEDED_MAIN_HOLDINGS } from "./robinhood";

export class HoldingsSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HoldingsSnapshotError";
  }
}

export type HoldingsPreviewAction = "update-node" | "update-treasury" | "unmatched";

export interface HoldingsPreviewRow {
  symbol: string;
  matchedTicker: string | null;
  nodeName: string | null;
  currentStatus: PositionStatus | null;
  nextStatus: PositionStatus | null;
  quantity: number | string;
  averageCost: number | string | null;
  venue: string;
  note: string;
  target: SnapshotHoldingTarget;
  action: HoldingsPreviewAction;
  warnings: string[];
}

export interface HoldingsPreview {
  asOf: string;
  source: string;
  syncSource: string;
  rows: HoldingsPreviewRow[];
  matchedNodeCount: number;
  unmatchedCount: number;
  treasuryUpdates: number;
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function looksLikeHoldingsSnapshot(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Array.isArray(value.holdings) && typeof value.source === "string";
}

export function parseQuantityValue(
  value: unknown,
  label: string,
): number | string {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new HoldingsSnapshotError(`${label} must be a number ≥ 0.`);
    }
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new HoldingsSnapshotError(`${label} must not be empty.`);
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new HoldingsSnapshotError(`${label} must be a number ≥ 0.`);
    }
    return trimmed;
  }
  throw new HoldingsSnapshotError(`${label} must be a number or numeric string.`);
}

export function parseOptionalQuantityValue(
  value: unknown,
  label: string,
): number | string | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return undefined;
  return parseQuantityValue(value, label);
}

export function syncSourceFromSnapshot(source: string): string {
  const normalized = source.trim().toLowerCase();
  if (!normalized) return "snapshot";
  if (normalized.endsWith("-snapshot")) return normalized;
  return `${normalized}-snapshot`;
}

export function defaultVenueForSource(source: string): string {
  const normalized = source.trim().toLowerCase();
  if (normalized === "robinhood" || normalized === "robinhood-snapshot") {
    return "Robinhood";
  }
  if (normalized === "xaman") return "Xaman";
  if (normalized === "coinbase") return "Coinbase";
  if (normalized === "metamask") return "MetaMask";
  return source.trim();
}

function parseHolding(
  raw: unknown,
  index: number,
): HoldingsSnapshotHolding {
  if (!isRecord(raw)) {
    throw new HoldingsSnapshotError(`holdings[${index}] must be an object.`);
  }
  const symbol = asTrimmedString(raw.symbol)?.toUpperCase();
  if (!symbol) {
    throw new HoldingsSnapshotError(`holdings[${index}].symbol is required.`);
  }
  const quantity = parseQuantityValue(
    raw.quantity,
    `holdings[${index}] (${symbol}) quantity`,
  );
  const averageCost = parseOptionalQuantityValue(
    raw.averageCost,
    `holdings[${index}] (${symbol}) averageCost`,
  );
  const target: SnapshotHoldingTarget | undefined =
    raw.target === "treasury" || raw.target === "node" ? raw.target : undefined;
  const holding: HoldingsSnapshotHolding = {
    symbol,
    quantity,
  };
  if (typeof raw.assetClass === "string" && raw.assetClass.trim()) {
    holding.assetClass = raw.assetClass.trim().toLowerCase();
  }
  if (averageCost !== undefined) holding.averageCost = averageCost;
  const venue = asTrimmedString(raw.venue);
  if (venue) holding.venue = venue;
  const note = asTrimmedString(raw.note);
  if (note) holding.note = note;
  if (target) holding.target = target;
  return holding;
}

export function parseHoldingsSnapshot(text: string): HoldingsSnapshot {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new HoldingsSnapshotError("Paste a holdings snapshot JSON first.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new HoldingsSnapshotError("JSON is not valid. Check quotes and commas.");
  }
  return normalizeHoldingsSnapshot(parsed);
}

export function normalizeHoldingsSnapshot(raw: unknown): HoldingsSnapshot {
  if (!isRecord(raw)) {
    throw new HoldingsSnapshotError("Snapshot must be a JSON object.");
  }
  if (raw.nodes || raw.treasury) {
    throw new HoldingsSnapshotError(
      "This looks like a full Resonance export. Use Local snapshot → Import instead.",
    );
  }
  const asOf = asTrimmedString(raw.asOf);
  if (!asOf) {
    throw new HoldingsSnapshotError("asOf is required (ISO timestamp).");
  }
  if (Number.isNaN(new Date(asOf).getTime())) {
    throw new HoldingsSnapshotError("asOf must be a parseable ISO date.");
  }
  const source = asTrimmedString(raw.source);
  if (!source) {
    throw new HoldingsSnapshotError("source is required (e.g. \"robinhood\").");
  }
  if (!Array.isArray(raw.holdings) || raw.holdings.length === 0) {
    throw new HoldingsSnapshotError("holdings must be a non-empty array.");
  }
  const holdings = raw.holdings.map((item, index) => parseHolding(item, index));
  return { asOf, source, holdings };
}

function expectedNodeClass(
  assetClass: string | undefined,
): Node["class"] | null {
  if (!assetClass) return null;
  const normalized = assetClass.toLowerCase();
  if (normalized === "equity" || normalized === "physical") return "physical";
  if (normalized === "crypto" || normalized === "digital") return "digital";
  return null;
}

export function previewHoldingsSnapshot(
  state: AppState,
  snapshot: HoldingsSnapshot,
): HoldingsPreview {
  const byTicker = new Map(
    state.nodes.map((node) => [node.ticker.toUpperCase(), node]),
  );
  const seen = new Map<string, number>();
  const defaultVenue = defaultVenueForSource(snapshot.source);
  const rows: HoldingsPreviewRow[] = [];
  const warnings: string[] = [];

  for (const holding of snapshot.holdings) {
    const symbol = holding.symbol.toUpperCase();
    const priorIndex = seen.get(symbol);
    if (priorIndex !== undefined) {
      rows[priorIndex].warnings.push(
        "Later duplicate in this snapshot replaces this row.",
      );
    }
    seen.set(symbol, rows.length);

    const node = byTicker.get(symbol);
    const venue = holding.venue?.trim() || defaultVenue;
    const target: SnapshotHoldingTarget = holding.target ?? "node";
    const rowWarnings: string[] = [];
    const expectedClass = expectedNodeClass(holding.assetClass);
    if (node && expectedClass && node.class !== expectedClass) {
      rowWarnings.push(
        `assetClass ${holding.assetClass} does not match board node class ${node.class}. Still applying by ticker.`,
      );
    }

    if (target === "treasury") {
      const treasuryAsset = state.treasury.asset.toUpperCase();
      if (symbol !== treasuryAsset) {
        rows.push({
          symbol,
          matchedTicker: null,
          nodeName: null,
          currentStatus: null,
          nextStatus: null,
          quantity: holding.quantity,
          averageCost: holding.averageCost ?? null,
          venue,
          note: holding.note ?? "",
          target,
          action: "unmatched",
          warnings: [
            `Treasury target only applies to ${treasuryAsset}. This row will be skipped.`,
          ],
        });
        continue;
      }
      rowWarnings.push(
        "Explicit treasury target: will update Xaman working principal. Unusual for a Robinhood snapshot.",
      );
      rows.push({
        symbol,
        matchedTicker: treasuryAsset,
        nodeName: `${state.treasury.asset} treasury`,
        currentStatus: null,
        nextStatus: null,
        quantity: holding.quantity,
        averageCost: holding.averageCost ?? null,
        venue,
        note: holding.note ?? "",
        target,
        action: "update-treasury",
        warnings: rowWarnings,
      });
      continue;
    }

    if (!node) {
      rows.push({
        symbol,
        matchedTicker: null,
        nodeName: null,
        currentStatus: null,
        nextStatus: null,
        quantity: holding.quantity,
        averageCost: holding.averageCost ?? null,
        venue,
        note: holding.note ?? "",
        target,
        action: "unmatched",
        warnings: ["No board node with this ticker. Will skip."],
      });
      continue;
    }

    if (symbol === "XRP") {
      rowWarnings.push(
        "Applies to the XRP node holding at this venue only. Xaman treasury principal is left unchanged.",
      );
    }

    rows.push({
      symbol,
      matchedTicker: node.ticker,
      nodeName: node.name,
      currentStatus: node.status,
      nextStatus: "funded",
      quantity: holding.quantity,
      averageCost:
        holding.averageCost !== undefined ? holding.averageCost : node.averageCost,
      venue,
      note: holding.note ?? node.holdingsNote,
      target,
      action: "update-node",
      warnings: rowWarnings,
    });
  }

  const matchedNodeCount = rows.filter((row) => row.action === "update-node").length;
  const unmatchedCount = rows.filter((row) => row.action === "unmatched").length;
  const treasuryUpdates = rows.filter((row) => row.action === "update-treasury").length;
  if (matchedNodeCount === 0 && treasuryUpdates === 0) {
    warnings.push("No matching board nodes. Nothing would be applied.");
  }
  if (rows.some((row) => row.symbol === "XRP" && row.action === "update-node")) {
    warnings.push(
      "Robinhood XRP is a separate bag from the Xaman / Flare-vault treasury. Treasury figures are not overwritten.",
    );
  }

  return {
    asOf: snapshot.asOf,
    source: snapshot.source,
    syncSource: syncSourceFromSnapshot(snapshot.source),
    rows,
    matchedNodeCount,
    unmatchedCount,
    treasuryUpdates,
    warnings,
  };
}

function patchNodeFromHolding(
  node: Node,
  holding: HoldingsSnapshotHolding,
  snapshot: HoldingsSnapshot,
): Node {
  const venue =
    holding.venue?.trim() ||
    node.venue ||
    defaultVenueForSource(snapshot.source);
  return {
    ...node,
    status: "funded",
    quantity: holding.quantity,
    averageCost:
      holding.averageCost !== undefined ? holding.averageCost : node.averageCost,
    venue,
    lastSyncedAt: snapshot.asOf,
    syncSource: syncSourceFromSnapshot(snapshot.source),
    holdingsNote: holding.note ?? node.holdingsNote,
    sleeve:
      SEEDED_MAIN_HOLDINGS[node.ticker]?.sleeve ??
      (venue.toLowerCase().includes("robinhood") ? "main" : node.sleeve),
  };
}

export function applyHoldingsSnapshot(
  state: AppState,
  snapshot: HoldingsSnapshot,
): AppState {
  const preview = previewHoldingsSnapshot(state, snapshot);
  if (preview.matchedNodeCount === 0 && preview.treasuryUpdates === 0) {
    throw new HoldingsSnapshotError(
      "No matching board nodes in this snapshot. Nothing applied.",
    );
  }

  const byTicker = new Map(
    snapshot.holdings.map((holding) => [holding.symbol.toUpperCase(), holding]),
  );

  const nodes = state.nodes.map((node) => {
    const holding = byTicker.get(node.ticker.toUpperCase());
    if (!holding) return node;
    if ((holding.target ?? "node") === "treasury") return node;
    return patchNodeFromHolding(node, holding, snapshot);
  });

  let treasury = state.treasury;
  for (const holding of byTicker.values()) {
    if ((holding.target ?? "node") !== "treasury") continue;
    if (holding.symbol.toUpperCase() !== treasury.asset.toUpperCase()) continue;
    const units = holdingToNumber(holding.quantity);
    if (units === null) continue;
    treasury = {
      ...treasury,
      units,
      provenance: "founder-reported",
      updatedAt: snapshot.asOf,
    };
  }

  return { ...state, nodes, treasury };
}

export function latestHoldingsSync(
  nodes: Node[],
): { at: string; source: string } | null {
  let latest: { at: string; source: string } | null = null;
  for (const node of nodes) {
    if (!node.lastSyncedAt) continue;
    const time = new Date(node.lastSyncedAt).getTime();
    if (Number.isNaN(time)) continue;
    if (!latest || time >= new Date(latest.at).getTime()) {
      latest = {
        at: node.lastSyncedAt,
        source: node.syncSource || "snapshot",
      };
    }
  }
  return latest;
}

export function hasHoldings(node: Pick<Node, "quantity" | "venue" | "averageCost">): boolean {
  return (
    node.quantity !== null &&
    node.quantity !== undefined &&
    node.quantity !== ""
  );
}

export const HOLDINGS_SNAPSHOT_HELP = `{
  "asOf": "2026-09-11T16:10:00Z",
  "source": "robinhood",
  "holdings": [
    { "symbol": "PWR", "assetClass": "equity", "quantity": "0.070066", "averageCost": "627.98", "venue": "Robinhood" },
    { "symbol": "XRP", "assetClass": "crypto", "quantity": "69.169", "venue": "Robinhood", "note": "Separate from Xaman treasury" }
  ]
}`;
