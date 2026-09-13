import { applyLedgerToTreasury, roundUnits } from "./ledger";
import { applyHoldingsSnapshot } from "./holdings-snapshot";
import { mergeDecisionsById } from "./decisions";
import {
  deleteServerDecision,
  pushDecisionNow,
  pushDecisionRecords,
  scheduleDecisionPush,
} from "./decisions-client-sync";
import { createSeedState } from "./seed";
import { loadState, saveState } from "./storage";
import { newId } from "./format";
import { mergeLedgerById } from "./treasury-ledger";
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

export function addDecision(
  entry: Omit<Decision, "id" | "createdAt"> & { id?: string },
) {
  const id = entry.id?.trim() || newId("dec");
  const full: Decision = {
    ...entry,
    id,
    proposal: entry.proposal ?? "",
    rationale: entry.rationale ?? "",
    authorizedBy: entry.authorizedBy ?? "",
    outcome: entry.outcome ?? "",
    evidence: entry.evidence ?? "",
    reviewTrigger: entry.reviewTrigger ?? "",
    fingerprint: entry.fingerprint ?? null,
    attestationStatus: entry.attestationStatus ?? "web2_only",
    hederaMessageId: entry.hederaMessageId ?? null,
    attestedAt: entry.attestedAt ?? null,
    xrplTxHash: entry.xrplTxHash ?? null,
    xrplMemoAt: entry.xrplMemoAt ?? null,
    createdAt: new Date().toISOString(),
  };
  update((current) => {
    if (current.decisions.some((item) => item.id === id)) {
      throw new Error(`A record with ID ${id} already exists.`);
    }
    return {
      ...current,
      decisions: [full, ...current.decisions],
    };
  });
  pushDecisionNow(full);
}

export function updateDecision(id: string, patch: Partial<Decision>) {
  update((current) => ({
    ...current,
    decisions: current.decisions.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    ),
  }));
  const next = getAppSnapshot().decisions.find((item) => item.id === id);
  if (next) scheduleDecisionPush(next);
}

export function deleteDecision(id: string) {
  update((current) => ({
    ...current,
    decisions: current.decisions.filter((item) => item.id !== id),
  }));
  void deleteServerDecision(id);
}

export function mergeDecisionsFromServer(incoming: Decision[]) {
  setSnapshot(
    {
      ...getAppSnapshot(),
      decisions: mergeDecisionsById(getAppSnapshot().decisions, incoming),
    },
    true,
  );
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

export function importDecisionsMerge(incoming: Decision[]) {
  setSnapshot(
    {
      ...getAppSnapshot(),
      decisions: mergeDecisionsById(getAppSnapshot().decisions, incoming),
    },
    true,
  );
  void pushDecisionRecords(incoming);
}

export function importTreasuryLedgerMerge(
  incoming: LedgerEntry[],
  treasuryPatch?: Partial<Treasury> | null,
) {
  const current = getAppSnapshot();
  setSnapshot(
    {
      ...current,
      ledger: mergeLedgerById(current.ledger, incoming),
      treasury: treasuryPatch
        ? {
            ...current.treasury,
            ...treasuryPatch,
            provenance: treasuryPatch.provenance ?? "founder-reported",
            updatedAt: new Date().toISOString(),
          }
        : current.treasury,
    },
    true,
  );
}
