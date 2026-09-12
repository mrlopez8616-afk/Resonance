import type { LedgerClassification, LedgerEntry, Treasury } from "./types";

export class TreasuryLedgerImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TreasuryLedgerImportError";
  }
}

export const TREASURY_CURRENT_UNITS = 27772;
export const TREASURY_OPENING_UNITS = 20000;
export const TREASURY_AS_OF = "2026-09-12T00:00:00.000Z";

export const OLD_SEED_LEDGER_IDS = new Set([
  "led-open",
  "led-d1",
  "led-w1",
]);

export interface TreasuryLedgerImport {
  asOf: string | null;
  source: string | null;
  treasury: Partial<Pick<Treasury, "units" | "venue" | "locationNote" | "estimatedDailyReward" | "provenance">> | null;
  ledger: LedgerEntry[];
}

export type LedgerMergeAction = "add" | "update" | "keep";

export interface LedgerMergePreviewRow {
  id: string;
  action: LedgerMergeAction;
  date: string;
  classification: LedgerClassification;
  amount: number;
}

export interface LedgerMergePreview {
  added: number;
  updated: number;
  unchanged: number;
  untouchedLocal: number;
  appliesTreasury: boolean;
  nextUnits: number | null;
  rows: LedgerMergePreviewRow[];
}

export const TREASURY_IMPORT_HELP = `{
  "asOf": "2026-09-12T00:00:00Z",
  "source": "founder-reported",
  "treasury": {
    "units": 27772,
    "venue": "Xaman",
    "locationNote": "Flare vault / Xaman principal trail starting 2026-08-28",
    "estimatedDailyReward": 1,
    "provenance": "founder-reported"
  },
  "ledger": [
    {
      "id": "led-2026-08-28-open",
      "date": "2026-08-28",
      "amount": 20000,
      "fee": 0,
      "classification": "principal",
      "note": "Opening Flare vault / Xaman principal.",
      "applyToBalance": false
    }
  ]
}`;

export const LOCKED_TREASURY_LEDGER: LedgerEntry[] = [
  {
    id: "led-2026-08-28-open",
    date: "2026-08-28",
    amount: TREASURY_OPENING_UNITS,
    fee: 0,
    note: "Opening Flare vault / Xaman principal trail. Started ~20,000 XRP. Founder-reported — not chain-verified. Principal never withdrawn.",
    classification: "principal",
    applyToBalance: false,
    createdAt: "2026-08-28T16:00:00.000Z",
  },
  {
    id: "led-2026-09-02-add",
    date: "2026-09-02",
    amount: 4000,
    fee: 0,
    note: "Weekly-class principal add (~4k). Founder-reported path: ~20k → +~4k.",
    classification: "principal",
    applyToBalance: false,
    createdAt: "2026-09-02T16:00:00.000Z",
  },
  {
    id: "led-2026-09-06-add",
    date: "2026-09-06",
    amount: 1000,
    fee: 0,
    note: "Weekly-class principal add (~1k).",
    classification: "principal",
    applyToBalance: false,
    createdAt: "2026-09-06T16:00:00.000Z",
  },
  {
    id: "led-2026-09-09-add",
    date: "2026-09-09",
    amount: 1000,
    fee: 0,
    note: "Weekly-class principal add (~1k). Path through early Sep: ~20k then +~4k then +1k then +1k.",
    classification: "principal",
    applyToBalance: false,
    createdAt: "2026-09-09T16:00:00.000Z",
  },
  {
    id: "led-2026-09-11-mark",
    date: "2026-09-11",
    amount: 1772,
    fee: 0,
    note: "Founder-reported residual to current books (~27,772 XRP as of 2026-09-11/12). Additional principal not itemized week-by-week. Principal still never withdrawn.",
    classification: "principal",
    applyToBalance: false,
    createdAt: "2026-09-11T20:00:00.000Z",
  },
  {
    id: "led-2026-09-11-yield-ammo",
    date: "2026-09-11",
    amount: 14,
    fee: 0,
    note: "Yield ammo only (~1 XRP/day class, Aug 28 → Sep 11). Not principal. Harvest is later funding rail — do not fold into working principal.",
    classification: "reward",
    applyToBalance: false,
    createdAt: "2026-09-11T20:05:00.000Z",
  },
];

export function isOfficialTreasuryLedgerId(id: string): boolean {
  return LOCKED_TREASURY_LEDGER.some((entry) => entry.id === id);
}

export function principalTrailTotal(entries: LedgerEntry[] = LOCKED_TREASURY_LEDGER): number {
  return entries
    .filter((entry) => entry.classification === "principal")
    .reduce((sum, entry) => sum + entry.amount - entry.fee, 0);
}

export interface LedgerTrailRow extends LedgerEntry {
  runningPrincipal: number | null;
}

export function chronologicalLedger(entries: LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/** Running principal after each row. Reward / fee / transfer do not move this trail. */
export function withRunningPrincipal(entries: LedgerEntry[]): LedgerTrailRow[] {
  let running = 0;
  return chronologicalLedger(entries).map((entry) => {
    if (entry.classification === "principal") {
      running += entry.amount - entry.fee;
      return { ...entry, runningPrincipal: running };
    }
    return { ...entry, runningPrincipal: null };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function parseClassification(value: unknown): LedgerClassification {
  if (
    value === "principal" ||
    value === "reward" ||
    value === "fee" ||
    value === "transfer"
  ) {
    return value;
  }
  return "reward";
}

export function normalizeLedgerEntry(raw: unknown, index: number): LedgerEntry {
  if (!isRecord(raw)) {
    throw new TreasuryLedgerImportError(`ledger[${index}] must be an object.`);
  }
  const id = asTrimmedString(raw.id);
  if (!id) {
    throw new TreasuryLedgerImportError(`ledger[${index}].id is required.`);
  }
  const amount = asNumber(raw.amount, Number.NaN);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new TreasuryLedgerImportError(
      `ledger[${index}].amount must be a number ≥ 0.`,
    );
  }
  const fee = asNumber(raw.fee, 0);
  if (!Number.isFinite(fee) || fee < 0) {
    throw new TreasuryLedgerImportError(
      `ledger[${index}].fee must be a number ≥ 0.`,
    );
  }
  return {
    id,
    date: asString(raw.date, "").trim(),
    amount,
    fee,
    note: asString(raw.note, "").trim(),
    classification: parseClassification(raw.classification),
    applyToBalance: asBoolean(raw.applyToBalance, false),
    createdAt: asString(raw.createdAt, asString(raw.date, "")),
  };
}

export function coerceStoredLedgerEntry(
  raw: unknown,
  index: number,
): LedgerEntry | null {
  if (!isRecord(raw)) return null;
  return {
    id: asTrimmedString(raw.id) ?? `led-${index}`,
    date: asString(raw.date, ""),
    amount: asNumber(raw.amount, 0),
    fee: asNumber(raw.fee, 0),
    note: asString(raw.note, ""),
    classification: parseClassification(raw.classification),
    applyToBalance: asBoolean(raw.applyToBalance, false),
    createdAt: asString(raw.createdAt, asString(raw.date, "")),
  };
}

export function ledgerContentEqual(a: LedgerEntry, b: LedgerEntry): boolean {
  return (
    a.date === b.date &&
    a.amount === b.amount &&
    a.fee === b.fee &&
    a.note === b.note &&
    a.classification === b.classification &&
    a.applyToBalance === b.applyToBalance
  );
}

export function mergeLedgerById(
  existing: LedgerEntry[],
  incoming: LedgerEntry[],
): LedgerEntry[] {
  const byId = new Map<string, LedgerEntry>();
  for (const item of existing) byId.set(item.id, item);
  for (const item of incoming) {
    const prev = byId.get(item.id);
    if (!prev) {
      byId.set(item.id, {
        ...item,
        createdAt: item.createdAt || new Date().toISOString(),
      });
      continue;
    }
    byId.set(item.id, {
      ...prev,
      ...item,
      createdAt: prev.createdAt || item.createdAt || new Date().toISOString(),
    });
  }
  return Array.from(byId.values());
}

export function dropLegacyOpeningSeed(entries: LedgerEntry[]): LedgerEntry[] {
  return entries.filter((entry) => !OLD_SEED_LEDGER_IDS.has(entry.id));
}

export function looksLikeLegacyOpeningSeed(
  units: number,
  entries: LedgerEntry[],
): boolean {
  return (
    units === 26000 && entries.some((entry) => entry.id === "led-open")
  );
}

export function previewLedgerMerge(
  existing: LedgerEntry[],
  incoming: LedgerEntry[],
  currentUnits: number,
  nextUnits: number | null,
): LedgerMergePreview {
  const byId = new Map(existing.map((item) => [item.id, item]));
  const incomingIds = new Set(incoming.map((item) => item.id));
  const rows: LedgerMergePreviewRow[] = incoming.map((item) => {
    const prev = byId.get(item.id);
    if (!prev) {
      return {
        id: item.id,
        action: "add",
        date: item.date,
        classification: item.classification,
        amount: item.amount,
      };
    }
    return {
      id: item.id,
      action: ledgerContentEqual(prev, item) ? "keep" : "update",
      date: item.date,
      classification: item.classification,
      amount: item.amount,
    };
  });
  return {
    added: rows.filter((row) => row.action === "add").length,
    updated: rows.filter((row) => row.action === "update").length,
    unchanged: rows.filter((row) => row.action === "keep").length,
    untouchedLocal: existing.filter((item) => !incomingIds.has(item.id)).length,
    appliesTreasury: nextUnits !== null && nextUnits !== currentUnits,
    nextUnits,
    rows,
  };
}

function parseTreasuryPatch(
  raw: unknown,
): TreasuryLedgerImport["treasury"] {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw)) {
    throw new TreasuryLedgerImportError("treasury must be an object when present.");
  }
  const patch: TreasuryLedgerImport["treasury"] = {};
  if (raw.units !== undefined) {
    const units = asNumber(raw.units, Number.NaN);
    if (!Number.isFinite(units) || units < 0) {
      throw new TreasuryLedgerImportError("treasury.units must be a number ≥ 0.");
    }
    patch.units = units;
  }
  if (typeof raw.venue === "string") patch.venue = raw.venue.trim();
  if (typeof raw.locationNote === "string") {
    patch.locationNote = raw.locationNote.trim();
  }
  if (raw.estimatedDailyReward !== undefined) {
    const daily = asNumber(raw.estimatedDailyReward, Number.NaN);
    if (!Number.isFinite(daily) || daily < 0) {
      throw new TreasuryLedgerImportError(
        "treasury.estimatedDailyReward must be a number ≥ 0.",
      );
    }
    patch.estimatedDailyReward = daily;
  }
  if (
    raw.provenance === "founder-reported" ||
    raw.provenance === "verified" ||
    raw.provenance === "unverified"
  ) {
    patch.provenance = raw.provenance;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

export function parseTreasuryLedgerImport(text: string): TreasuryLedgerImport {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new TreasuryLedgerImportError("Paste a treasury ledger JSON first.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new TreasuryLedgerImportError("JSON is not valid. Check quotes and commas.");
  }
  return normalizeTreasuryLedgerImport(parsed);
}

export function normalizeTreasuryLedgerImport(raw: unknown): TreasuryLedgerImport {
  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      throw new TreasuryLedgerImportError("ledger array is empty.");
    }
    return {
      asOf: null,
      source: null,
      treasury: null,
      ledger: raw.map((item, index) => normalizeLedgerEntry(item, index)),
    };
  }
  if (!isRecord(raw)) {
    throw new TreasuryLedgerImportError(
      "Expected a ledger array or an object with a ledger array.",
    );
  }
  if (Array.isArray(raw.decisions) && !Array.isArray(raw.ledger)) {
    throw new TreasuryLedgerImportError(
      "This looks like a decisions record book. Use Decisions → Import / merge.",
    );
  }
  if (Array.isArray(raw.holdings) && !Array.isArray(raw.ledger)) {
    throw new TreasuryLedgerImportError(
      "This looks like a holdings snapshot. Use Settings → Import holdings snapshot.",
    );
  }
  if (!Array.isArray(raw.ledger)) {
    throw new TreasuryLedgerImportError("JSON must include a ledger array.");
  }
  if (raw.ledger.length === 0) {
    throw new TreasuryLedgerImportError("ledger array is empty.");
  }
  const asOf = asTrimmedString(raw.asOf);
  if (asOf && Number.isNaN(new Date(asOf).getTime())) {
    throw new TreasuryLedgerImportError("asOf must be a parseable ISO date.");
  }
  return {
    asOf,
    source: asTrimmedString(raw.source),
    treasury: parseTreasuryPatch(raw.treasury),
    ledger: raw.ledger.map((item, index) => normalizeLedgerEntry(item, index)),
  };
}

export function exportTreasuryLedgerJson(
  treasury: Treasury,
  ledger: LedgerEntry[],
): string {
  return JSON.stringify(
    {
      asOf: new Date().toISOString(),
      source: "resonance-treasury",
      treasury: {
        units: treasury.units,
        venue: treasury.venue,
        locationNote: treasury.locationNote,
        estimatedDailyReward: treasury.estimatedDailyReward,
        provenance: treasury.provenance,
      },
      ledger,
    },
    null,
    2,
  );
}
