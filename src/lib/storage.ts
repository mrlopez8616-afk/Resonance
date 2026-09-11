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
  return raw.filter(isRecord).map((item, index) => ({
    id: asString(item.id, `dec-${index}`),
    question: asString(item.question, ""),
    options: asString(item.options, ""),
    status: item.status === "decided" ? "decided" : "pending",
    decision: asString(item.decision, ""),
    date: asString(item.date, ""),
    createdAt: asString(item.createdAt, ""),
  }));
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
