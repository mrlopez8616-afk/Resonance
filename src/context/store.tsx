"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  addDecision as addDecisionAction,
  addLedgerEntry as addLedgerEntryAction,
  deleteDecision as deleteDecisionAction,
  deleteLedgerEntry as deleteLedgerEntryAction,
  getAppSnapshot,
  getServerAppSnapshot,
  getServerStoreEpoch,
  getStoreEpoch,
  replaceState,
  resetToSeed as resetToSeedAction,
  setVenues as setVenuesAction,
  subscribeAppStore,
  updateDecision as updateDecisionAction,
  updateLedgerEntry as updateLedgerEntryAction,
  updateNode as updateNodeAction,
  updateSettings as updateSettingsAction,
  updateTreasury as updateTreasuryAction,
  importHoldingsSnapshot as importHoldingsSnapshotAction,
  importDecisionsMerge as importDecisionsMergeAction,
} from "@/lib/app-store";
import { exportDecisionsJson } from "@/lib/decisions";
import { exportState, parseImportedState } from "@/lib/storage";
import type {
  AppState,
  Decision,
  HoldingsSnapshot,
  LedgerEntry,
  Node,
  Settings,
  Treasury,
  Venue,
} from "@/lib/types";

const emptySubscribe = () => () => {};

function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

type StoreContextValue = {
  ready: boolean;
  epoch: number;
  state: AppState;
  updateTreasury: (patch: Partial<Treasury>) => void;
  setVenues: (venues: Venue[]) => void;
  updateNode: (ticker: string, patch: Partial<Node>) => void;
  addLedgerEntry: (entry: Omit<LedgerEntry, "id" | "createdAt">) => void;
  updateLedgerEntry: (id: string, patch: Partial<LedgerEntry>) => void;
  deleteLedgerEntry: (id: string) => void;
  addDecision: (
    entry: Omit<Decision, "id" | "createdAt"> & { id?: string },
  ) => void;
  updateDecision: (id: string, patch: Partial<Decision>) => void;
  deleteDecision: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  resetToSeed: () => void;
  exportJson: () => string;
  importJson: (text: string) => void;
  importHoldingsSnapshot: (snapshot: HoldingsSnapshot) => void;
  importDecisionsMerge: (incoming: Decision[]) => void;
  exportDecisionsJson: () => string;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const ready = useIsClient();
  const state = useSyncExternalStore(
    subscribeAppStore,
    getAppSnapshot,
    getServerAppSnapshot,
  );
  const epoch = useSyncExternalStore(
    subscribeAppStore,
    getStoreEpoch,
    getServerStoreEpoch,
  );

  const exportJson = useCallback(() => exportState(state), [state]);
  const importJson = useCallback((text: string) => {
    replaceState(parseImportedState(text));
  }, []);
  const exportDecisions = useCallback(
    () => exportDecisionsJson(state.decisions),
    [state.decisions],
  );

  const value = useMemo(
    () => ({
      ready,
      epoch,
      state,
      updateTreasury: updateTreasuryAction,
      setVenues: setVenuesAction,
      updateNode: updateNodeAction,
      addLedgerEntry: addLedgerEntryAction,
      updateLedgerEntry: updateLedgerEntryAction,
      deleteLedgerEntry: deleteLedgerEntryAction,
      addDecision: addDecisionAction,
      updateDecision: updateDecisionAction,
      deleteDecision: deleteDecisionAction,
      updateSettings: updateSettingsAction,
      resetToSeed: resetToSeedAction,
      exportJson,
      importJson,
      importHoldingsSnapshot: importHoldingsSnapshotAction,
      importDecisionsMerge: importDecisionsMergeAction,
      exportDecisionsJson: exportDecisions,
    }),
    [ready, epoch, state, exportJson, importJson, exportDecisions],
  );

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error("useStore must be used inside StoreProvider");
  }
  return ctx;
}
