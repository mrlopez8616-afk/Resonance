import { applyLedgerToTreasury, roundUnits } from "./ledger";
import { applyHoldingsSnapshot } from "./holdings-snapshot";
import { createSeedState } from "./seed";
import { loadState, saveState } from "./storage";
import { newId } from "./format";
import type {
  AppState,
  Decision,
  HoldingsSnapshot,
  LedgerEntry,
  Node,
  Settings,
  Treasury,
  Venue,
} from "./types";

const listeners = new Set<() => void>();
let snapshot: AppState | null = null;
let epoch = 0;
const serverSnapshot: AppState = createSeedState();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeAppStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAppSnapshot(): AppState {
  if (typeof window === "undefined") return serverSnapshot;
  if (!snapshot) snapshot = loadState();
  return snapshot;
}

export function getServerAppSnapshot(): AppState {
  return serverSnapshot;
}

export function getStoreEpoch(): number {
  return epoch;
}

export function getServerStoreEpoch(): number {
  return 0;
}

function setSnapshot(next: AppState, bumpEpoch = false) {
  snapshot = next;
  if (typeof window !== "undefined") saveState(next);
  if (bumpEpoch) epoch += 1;
  emit();
}

function update(mutator: (current: AppState) => AppState) {
  setSnapshot(mutator(getAppSnapshot()));
}

export function updateTreasury(patch: Partial<Treasury>) {
  update((current) => ({
    ...current,
    treasury: {
      ...current.treasury,
      ...patch,
      updatedAt: new Date().toISOString(),
    },
  }));
}

export function setVenues(venues: Venue[]) {
  update((current) => ({ ...current, venues }));
}

export function updateNode(ticker: string, patch: Partial<Node>) {
  update((current) => ({
    ...current,
    nodes: current.nodes.map((node) =>
      node.ticker === ticker ? { ...node, ...patch } : node,
    ),
  }));
}

export function addLedgerEntry(entry: Omit<LedgerEntry, "id" | "createdAt">) {
  const full: LedgerEntry = {
    ...entry,
    amount: roundUnits(entry.amount),
    fee: roundUnits(entry.fee),
    id: newId("led"),
    createdAt: new Date().toISOString(),
  };
  update((current) => applyLedgerToTreasury(current, full));
}

export function deleteLedgerEntry(id: string) {
  update((current) => ({
    ...current,
    ledger: current.ledger.filter((entry) => entry.id !== id),
  }));
}

export function updateLedgerEntry(id: string, patch: Partial<LedgerEntry>) {
  update((current) => ({
    ...current,
    ledger: current.ledger.map((entry) => {
      if (entry.id !== id) return entry;
      const next = { ...entry, ...patch };
      if (typeof patch.amount === "number") next.amount = roundUnits(patch.amount);
      if (typeof patch.fee === "number") next.fee = roundUnits(patch.fee);
      return next;
    }),
  }));
}

export function addDecision(entry: Omit<Decision, "id" | "createdAt">) {
  const full: Decision = {
    ...entry,
    id: newId("dec"),
    createdAt: new Date().toISOString(),
  };
  update((current) => ({
    ...current,
    decisions: [full, ...current.decisions],
  }));
}

export function updateDecision(id: string, patch: Partial<Decision>) {
  update((current) => ({
    ...current,
    decisions: current.decisions.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    ),
  }));
}

export function deleteDecision(id: string) {
  update((current) => ({
    ...current,
    decisions: current.decisions.filter((item) => item.id !== id),
  }));
}

export function updateSettings(patch: Partial<Settings>) {
  update((current) => ({
    ...current,
    settings: { ...current.settings, ...patch },
  }));
}

export function resetToSeed() {
  setSnapshot(createSeedState(new Date().toISOString()), true);
}

export function replaceState(next: AppState) {
  setSnapshot(next, true);
}

export function importHoldingsSnapshot(snapshot: HoldingsSnapshot) {
  setSnapshot(applyHoldingsSnapshot(getAppSnapshot(), snapshot), true);
}
