"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  addDecision as addDecisionAction,
  addLedgerEntry as addLedgerEntryAction,
  deleteDecision as deleteDecisionAction,
  deleteLedgerEntry as deleteLedgerEntryAction,
  getAppSnapshot,
  getServerAppSnapshot,
  getServerStoreEpoch,
  getStoreEpoch,
  mergeDecisionsFromServer,
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
  importTreasuryLedgerMerge as importTreasuryLedgerMergeAction,
} from "@/lib/app-store";
import { hydrateDecisionsFromServer } from "@/lib/decisions-client-sync";
import { exportDecisionsJson } from "@/lib/decisions";
import { exportState, parseImportedState } from "@/lib/storage";
import { exportTreasuryLedgerJson } from "@/lib/treasury-ledger";
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
  importTreasuryLedgerMerge: (
    incoming: LedgerEntry[],
    treasuryPatch?: Partial<Treasury> | null,
  ) => void;
  exportTreasuryLedgerJson: () => string;
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
  const exportTreasuryLedger = useCallback(
    () => exportTreasuryLedgerJson(state.treasury, state.ledger),
    [state.treasury, state.ledger],
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
      importTreasuryLedgerMerge: importTreasuryLedgerMergeAction,
      exportTreasuryLedgerJson: exportTreasuryLedger,
    }),
    [
      ready,
      epoch,
      state,
      exportJson,
      importJson,
      exportDecisions,
      exportTreasuryLedger,
    ],
  );

  return (
    <StoreContext.Provider value={value}>
      <Suspense fallback={null}>
        <DecisionStoreHydrate ready={ready} />
      </Suspense>
      {children}
    </StoreContext.Provider>
  );
}

function DecisionStoreHydrate({ ready }: { ready: boolean }) {
  const pathname = usePathname();
  const gatedOut = pathname === "/unlock";
  useEffect(() => {
    if (!ready || gatedOut) return;
    void hydrateDecisionsFromServer(mergeDecisionsFromServer);
  }, [ready, gatedOut]);
  return null;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error("useStore must be used inside StoreProvider");
  }
  return ctx;
}
