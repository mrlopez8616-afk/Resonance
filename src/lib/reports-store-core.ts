import {
  coerceStoredReport,
  createBinderSeedStub,
  createReport,
  mergeReportsById,
  removeReportById,
  reportsForDay,
  sortReports,
  ReportsImportError,
  type OperatorReport,
} from "./reports";
import {
  detectDecisionsBackend,
  isDecisionsSyncConfigured,
  type DecisionsStoreBackend,
} from "./decisions-store-core";

export const REPORTS_STORE_VERSION = 1;
export const REPORTS_BLOB_PATH = "resonance/reports.json";
export const DEFAULT_REPORTS_FILE = ".data/reports.json";

export type ReportsStoreBackend = DecisionsStoreBackend;

export interface ReportsStoreEnvelope {
  version: typeof REPORTS_STORE_VERSION;
  updatedAt: string;
  seededAt: string | null;
  reports: OperatorReport[];
}

export function detectReportsBackend(
  env: NodeJS.ProcessEnv = process.env,
): ReportsStoreBackend {
  return detectDecisionsBackend(env);
}

export function isReportsSyncConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isDecisionsSyncConfigured(env);
}

export function createEmptyReportsEnvelope(
  now = new Date().toISOString(),
): ReportsStoreEnvelope {
  return {
    version: REPORTS_STORE_VERSION,
    updatedAt: now,
    seededAt: null,
    reports: [],
  };
}

export function createSeededReportsEnvelope(
  now = new Date().toISOString(),
): ReportsStoreEnvelope {
  return {
    version: REPORTS_STORE_VERSION,
    updatedAt: now,
    seededAt: now,
    reports: [createBinderSeedStub()],
  };
}

export function ensureSeededReportsEnvelope(
  current: ReportsStoreEnvelope | null,
  now = new Date().toISOString(),
): { envelope: ReportsStoreEnvelope; seeded: boolean } {
  if (!current || current.reports.length === 0) {
    return { envelope: createSeededReportsEnvelope(now), seeded: true };
  }
  return { envelope: current, seeded: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseReportsEnvelope(raw: unknown): ReportsStoreEnvelope | null {
  if (!isRecord(raw) || !Array.isArray(raw.reports)) return null;
  const reports = raw.reports
    .map((item, index) => coerceStoredReport(item, index))
    .filter((item): item is OperatorReport => item !== null);
  return {
    version: REPORTS_STORE_VERSION,
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt
        ? raw.updatedAt
        : new Date().toISOString(),
    seededAt: typeof raw.seededAt === "string" ? raw.seededAt : null,
    reports: sortReports(reports),
  };
}

export function writeReportsIntoEnvelope(
  envelope: ReportsStoreEnvelope,
  items: Array<Partial<OperatorReport> & Record<string, unknown>>,
  now = new Date().toISOString(),
): ReportsStoreEnvelope {
  const materialized: OperatorReport[] = [];
  for (const [index, raw] of items.entries()) {
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const prev = id ? envelope.reports.find((item) => item.id === id) : undefined;
    if (prev && typeof raw.title !== "string" && typeof raw.body !== "string") {
      materialized.push(prev);
      continue;
    }
    const title =
      typeof raw.title === "string" ? raw.title.trim() : prev?.title ?? "";
    if (!title) {
      throw new ReportsImportError(`reports[${index}].title is required.`);
    }
    materialized.push(
      createReport({
        title,
        kind: raw.kind ?? prev?.kind,
        body: typeof raw.body === "string" ? raw.body : prev?.body,
        blobPointer:
          typeof raw.blobPointer === "string"
            ? raw.blobPointer
            : (raw.blobPointer === null ? null : prev?.blobPointer),
        createdAt:
          typeof raw.createdAt === "string" || typeof raw.createdAt === "number"
            ? raw.createdAt
            : prev?.createdAt,
        id: id || undefined,
        now,
        existing: [...envelope.reports, ...materialized],
      }),
    );
  }
  return {
    ...envelope,
    updatedAt: now,
    reports: mergeReportsById(envelope.reports, materialized),
  };
}

export function deleteReportFromEnvelope(
  envelope: ReportsStoreEnvelope,
  id: string,
  now = new Date().toISOString(),
): ReportsStoreEnvelope {
  return {
    ...envelope,
    updatedAt: now,
    reports: removeReportById(envelope.reports, id),
  };
}

export function listReportsByDay(
  envelope: ReportsStoreEnvelope,
  dayKey: string,
): OperatorReport[] {
  return reportsForDay(envelope.reports, dayKey);
}

export function findReportById(
  envelope: ReportsStoreEnvelope,
  id: string,
): OperatorReport | null {
  return envelope.reports.find((row) => row.id === id) ?? null;
}

export function reportsStoreHealth(input: {
  configured: boolean;
  backend: ReportsStoreBackend;
  envelope: ReportsStoreEnvelope | null;
}): {
  configured: boolean;
  backend: ReportsStoreBackend;
  itemCount: number;
  updatedAt: string | null;
  seeded: boolean;
} {
  return {
    configured: input.configured,
    backend: input.backend,
    itemCount: input.envelope?.reports.length ?? 0,
    updatedAt: input.envelope?.updatedAt ?? null,
    seeded: Boolean(input.envelope?.seededAt),
  };
}
