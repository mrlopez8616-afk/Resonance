import { coerceStoredDecision, mergeDecisionsById } from "./decisions";
import { mergeAgenticIntentsById } from "./robinhood";
import { createSeedState } from "./seed";
import {
  coerceStoredLedgerEntry,
  dropLegacyOpeningSeed,
  looksLikeLegacyOpeningSeed,
  mergeLedgerById,
  TREASURY_CURRENT_UNITS,
} from "./treasury-ledger";
import {
  STATE_VERSION,
  STORAGE_KEY,
  type AgenticIntent,
  type AppState,
  type Decision,
  type LedgerEntry,
  type Node,
  type NodeSleeve,
  type Settings,
  type Treasury,
  type Venue,
} from "./types";
import { mergeLinks } from "./valuation";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function mergeTreasury(raw: unknown, seed: Treasury): Treasury {
  if (!isRecord(raw)) return seed;
  const provenance =
    raw.provenance === "verified" ||
    raw.provenance === "founder-reported" ||
    raw.provenance === "unverified"
      ? raw.provenance
      : seed.provenance;
  return {
    units: asNumber(raw.units, seed.units),
    asset: "XRP",
    venue: asString(raw.venue, seed.venue),
    locationNote: asString(raw.locationNote, seed.locationNote),
    estimatedDailyReward: asNumber(
      raw.estimatedDailyReward,
      seed.estimatedDailyReward,
    ),
    manualUsdPerXrp:
      typeof raw.manualUsdPerXrp === "number" && Number.isFinite(raw.manualUsdPerXrp)
        ? raw.manualUsdPerXrp
        : raw.manualUsdPerXrp === null
          ? null
          : seed.manualUsdPerXrp,
    provenance,
    updatedAt: asString(raw.updatedAt, seed.updatedAt),
  };
}

function mergeVenues(raw: unknown, seed: Venue[]): Venue[] {
  if (!Array.isArray(raw) || raw.length === 0) return seed;
  return raw.filter(isRecord).map((item, index) => ({
    id: asString(item.id, `venue-${index}`),
    name: asString(item.name, "Unnamed venue"),
    role: asString(item.role, ""),
    notes: asString(item.notes, ""),
  }));
}

function mergeHoldingAmount(
  value: unknown,
  fallback: number | string | null,
): number | string | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return value;
  }
  return fallback;
}

function mergeNodes(raw: unknown, seed: Node[]): Node[] {
  const byTicker = new Map<string, Node>();
  for (const node of seed) byTicker.set(node.ticker, node);
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!isRecord(item)) continue;
      const ticker = asString(item.ticker, "").toUpperCase();
      const fallback = byTicker.get(ticker);
      if (!fallback) continue;
      const status =
        item.status === "none" ||
        item.status === "watch" ||
        item.status === "funded"
          ? item.status
          : fallback.status;
      byTicker.set(ticker, {
        ...fallback,
        thesis: asString(item.thesis, fallback.thesis),
        failureCondition: asString(
          item.failureCondition,
          fallback.failureCondition,
        ),
        name: asString(item.name, fallback.name),
        status,
        manualPriceUsd:
          typeof item.manualPriceUsd === "number" &&
          Number.isFinite(item.manualPriceUsd)
            ? item.manualPriceUsd
            : item.manualPriceUsd === null
              ? null
              : fallback.manualPriceUsd,
        manualPriceUpdatedAt: asString(
          item.manualPriceUpdatedAt,
          fallback.manualPriceUpdatedAt ?? "",
        ) || null,
        quantity: mergeHoldingAmount(item.quantity, fallback.quantity),
        averageCost: mergeHoldingAmount(item.averageCost, fallback.averageCost),
        venue: asString(item.venue, fallback.venue),
        lastSyncedAt: asString(
          item.lastSyncedAt,
          fallback.lastSyncedAt ?? "",
        ) || null,
        syncSource: asString(item.syncSource, fallback.syncSource ?? "") || null,
        holdingsNote: asString(item.holdingsNote, fallback.holdingsNote),
        sleeve: parseSleeve(item.sleeve, fallback.sleeve),
        links: mergeLinks(item.links, fallback.links),
      });
    }
  }
  return seed.map((node) => byTicker.get(node.ticker) ?? node);
}

function parseSleeve(value: unknown, fallback: NodeSleeve): NodeSleeve {
  if (value === "main" || value === "agentic" || value === "none") return value;
  return fallback;
}

function mergeLedger(raw: unknown, seed: LedgerEntry[]): LedgerEntry[] {
  if (!Array.isArray(raw)) return seed;
  const stored = raw
    .map((item, index) => coerceStoredLedgerEntry(item, index))
    .filter((item): item is LedgerEntry => item !== null);
  const withoutLegacy = dropLegacyOpeningSeed(stored);
  // Official trail IDs fill in; stored operator rows win on the same ID.
  return mergeLedgerById(seed, withoutLegacy);
}

function mergeAgenticIntents(
  raw: unknown,
  seed: AgenticIntent[],
): AgenticIntent[] {
  if (!Array.isArray(raw)) return seed;
  const stored = raw
    .filter(isRecord)
    .map((item, index) => normalizeStoredIntent(item, index))
    .filter((item): item is AgenticIntent => item !== null);
  return mergeAgenticIntentsById(seed, stored);
}

function normalizeStoredIntent(
  raw: Record<string, unknown>,
  index: number,
): AgenticIntent | null {
  const id = asString(raw.id, "").trim() || `agt-${index}`;
  const ticker = asString(raw.ticker, "").trim().toUpperCase();
  if (!ticker) return null;
  const side = raw.side === "sell" ? "sell" : "buy";
  const status =
    raw.status === "filled" || raw.status === "cancelled" ? raw.status : "queued";
  const notionalUsd =
    typeof raw.notionalUsd === "number" && Number.isFinite(raw.notionalUsd)
      ? raw.notionalUsd
      : raw.notionalUsd === null
        ? null
        : null;
  return {
    id,
    ticker,
    side,
    notionalUsd,
    status,
    authorizedByDecisionId: asString(raw.authorizedByDecisionId, ""),
    note: asString(raw.note, ""),
    venue: asString(raw.venue, "Robinhood"),
  };
}

function mergeDecisions(raw: unknown, seed: Decision[]): Decision[] {
  if (!Array.isArray(raw)) return seed;
  const stored = raw
    .map((item, index) => coerceStoredDecision(item, index))
    .filter((item): item is Decision => item !== null);
  // Stored rows win on ID. Seed fills official record-book IDs a browser is missing.
  return mergeDecisionsById(seed, stored);
}

function mergeSettings(raw: unknown, seed: Settings): Settings {
  if (!isRecord(raw)) return seed;
  return {
    operatorName: asString(raw.operatorName, seed.operatorName),
    operatingPriority: asString(raw.operatingPriority, seed.operatingPriority),
    xrplWatchAddress: asString(raw.xrplWatchAddress, seed.xrplWatchAddress),
    showYoutubeStub: asBoolean(raw.showYoutubeStub, seed.showYoutubeStub),
  };
}

export function migrateState(raw: unknown): AppState {
  const seed = createSeedState();
  if (!isRecord(raw)) return seed;
  const storedLedger = Array.isArray(raw.ledger)
    ? raw.ledger
        .map((item, index) => coerceStoredLedgerEntry(item, index))
        .filter((item): item is LedgerEntry => item !== null)
    : [];
  const storedUnits =
    isRecord(raw.treasury) && typeof raw.treasury.units === "number"
      ? raw.treasury.units
      : Number.NaN;
  const upgradeOpening = looksLikeLegacyOpeningSeed(storedUnits, storedLedger);
  const treasury = mergeTreasury(raw.treasury, seed.treasury);
  return {
    version: STATE_VERSION,
    treasury: upgradeOpening
      ? {
          ...treasury,
          units: TREASURY_CURRENT_UNITS,
          locationNote: seed.treasury.locationNote,
          provenance: "founder-reported",
        }
      : treasury,
    venues: mergeVenues(raw.venues, seed.venues),
    nodes: mergeNodes(raw.nodes, seed.nodes),
    ledger: mergeLedger(raw.ledger, seed.ledger),
    decisions: mergeDecisions(raw.decisions, seed.decisions),
    agenticIntents: mergeAgenticIntents(raw.agenticIntents, seed.agenticIntents),
    settings: mergeSettings(raw.settings, seed.settings),
  };
}

export function loadState(): AppState {
  if (typeof window === "undefined") return createSeedState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedState();
    return migrateState(JSON.parse(raw));
  } catch {
    return createSeedState();
  }
}

export function saveState(state: AppState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportState(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function parseImportedState(text: string): AppState {
  return migrateState(JSON.parse(text));
}
