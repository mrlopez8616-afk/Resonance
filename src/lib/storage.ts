import { coerceStoredDecision, mergeDecisionsById } from "./decisions";
import { createSeedState } from "./seed";
import {
  STATE_VERSION,
  STORAGE_KEY,
  type AppState,
  type Decision,
  type LedgerEntry,
  type Node,
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
        links: mergeLinks(item.links, fallback.links),
      });
    }
  }
  return seed.map((node) => byTicker.get(node.ticker) ?? node);
}

function mergeLedger(raw: unknown, seed: LedgerEntry[]): LedgerEntry[] {
  if (!Array.isArray(raw)) return seed;
  const entries = raw.filter(isRecord).map((item, index) => {
    const classification =
      item.classification === "principal" ||
      item.classification === "reward" ||
      item.classification === "fee" ||
      item.classification === "transfer"
        ? item.classification
        : "reward";
    return {
      id: asString(item.id, `led-${index}`),
      date: asString(item.date, ""),
      amount: asNumber(item.amount, 0),
      fee: asNumber(item.fee, 0),
      note: asString(item.note, ""),
      classification,
      applyToBalance: asBoolean(item.applyToBalance, false),
      createdAt: asString(item.createdAt, asString(item.date, "")),
    } satisfies LedgerEntry;
  });
  return entries;
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
  return {
    version: STATE_VERSION,
    treasury: mergeTreasury(raw.treasury, seed.treasury),
    venues: mergeVenues(raw.venues, seed.venues),
    nodes: mergeNodes(raw.nodes, seed.nodes),
    ledger: mergeLedger(raw.ledger, seed.ledger),
    decisions: mergeDecisions(raw.decisions, seed.decisions),
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
