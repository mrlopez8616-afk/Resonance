import type { AppState, LedgerClassification, LedgerEntry } from "./types";

export function netAmount(entry: Pick<LedgerEntry, "amount" | "fee">): number {
  return entry.amount - entry.fee;
}

export function balanceDelta(
  entry: Pick<
    LedgerEntry,
    "amount" | "fee" | "classification" | "applyToBalance"
  >,
): number {
  if (!entry.applyToBalance) return 0;
  const net = netAmount(entry);
  switch (entry.classification) {
    case "principal":
    case "reward":
    case "transfer":
      return net;
    case "fee":
      return -Math.abs(entry.amount || entry.fee);
    default:
      return 0;
  }
}

export function totalsByClassification(entries: LedgerEntry[]): Record<
  LedgerClassification,
  { count: number; amount: number; fees: number }
> {
  const empty = {
    count: 0,
    amount: 0,
    fees: 0,
  };
  const totals: Record<LedgerClassification, typeof empty> = {
    principal: { ...empty },
    reward: { ...empty },
    fee: { ...empty },
    transfer: { ...empty },
  };
  for (const entry of entries) {
    const bucket = totals[entry.classification];
    bucket.count += 1;
    bucket.amount += entry.amount;
    bucket.fees += entry.fee;
  }
  return totals;
}

export function applyLedgerToTreasury(
  state: AppState,
  entry: LedgerEntry,
): AppState {
  const delta = balanceDelta(entry);
  return {
    ...state,
    treasury: {
      ...state.treasury,
      units: roundUnits(state.treasury.units + delta),
      updatedAt: new Date().toISOString(),
    },
    ledger: [entry, ...state.ledger],
  };
}

export function roundUnits(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

export function sortLedger(entries: LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.createdAt.localeCompare(a.createdAt);
  });
}
