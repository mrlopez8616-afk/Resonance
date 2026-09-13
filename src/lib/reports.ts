import { sha256 } from "@noble/hashes/sha256";

export const REPORTS_DAY_TZ = "America/Chicago";
export const REPORT_KINDS = ["brief", "rh-ops", "build", "other"] as const;
export const REPORT_ATTESTATION_NOT_YET = "not_yet_attested" as const;

export type ReportKind = (typeof REPORT_KINDS)[number];
export type ReportAttestationStatus = typeof REPORT_ATTESTATION_NOT_YET;

export interface OperatorReport {
  id: string;
  title: string;
  kind: ReportKind;
  /** Chicago day key `YYYY-MM-DD` — the archive folder. */
  createdAt: string;
  body: string;
  /** Optional later pointer if the body lives in a sibling blob. */
  blobPointer: string | null;
  /** SHA-256 of the canonical filed record (title, kind, day, body). */
  fingerprint: string;
  attestationStatus: ReportAttestationStatus;
  /** Hedera / later witness link. Stub slot — unused in this brick. */
  attestLink: string | null;
  filedAt: string;
}

export class ReportsImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportsImportError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isReportKind(value: unknown): value is ReportKind {
  return typeof value === "string" && (REPORT_KINDS as readonly string[]).includes(value);
}

export function isIsoDayKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Calendar day in America/Chicago. Used as the archive folder key.
 * A bare `YYYY-MM-DD` is already a day key and is returned as-is.
 */
export function chicagoDayKey(at: Date | string | number = new Date()): string {
  if (typeof at === "string" && isIsoDayKey(at.trim())) {
    return at.trim();
  }
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) {
    throw new ReportsImportError("createdAt is not a valid date.");
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORTS_DAY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new ReportsImportError("Could not derive a Chicago day key.");
  }
  return `${year}-${month}-${day}`;
}

export function normalizeReportDayKey(
  value: string | Date | number | null | undefined,
  now = new Date(),
): string {
  if (value === null || value === undefined || value === "") {
    return chicagoDayKey(now);
  }
  return chicagoDayKey(value);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function fingerprintReportContent(input: {
  title: string;
  kind: ReportKind;
  createdAt: string;
  body: string;
}): string {
  const canonical = JSON.stringify({
    title: input.title,
    kind: input.kind,
    createdAt: input.createdAt,
    body: input.body,
  });
  return bytesToHex(sha256(new TextEncoder().encode(canonical)));
}

export function nextReportId(reports: OperatorReport[], dayKey: string): string {
  const prefix = `R-${dayKey}-`;
  let max = 0;
  for (const row of reports) {
    if (!row.id.startsWith(prefix)) continue;
    const n = Number(row.id.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}

export const REPORTS_SEED_FILED_AT = "2026-09-13T16:00:00.000Z";
export const REPORTS_SEED_DAY = "2026-09-13";

export function createBinderSeedStub(
  now: string = REPORTS_SEED_FILED_AT,
): OperatorReport {
  const createdAt = chicagoDayKey(now);
  const title = "Daily Resonance Brief (binder stub)";
  const kind: ReportKind = "brief";
  const body =
    "Binder is live. This stub exists so the archive has a folder to open. File today's brief from Reports. Auto-file from every routine is later. Paper/printer is later.";
  return {
    id: `R-${createdAt}-01`,
    title,
    kind,
    createdAt,
    body,
    blobPointer: null,
    fingerprint: fingerprintReportContent({ title, kind, createdAt, body }),
    attestationStatus: REPORT_ATTESTATION_NOT_YET,
    attestLink: null,
    filedAt: now,
  };
}

export function createReport(input: {
  title: string;
  kind?: unknown;
  body?: string;
  blobPointer?: string | null;
  createdAt?: string | Date | number | null;
  id?: string;
  now?: Date | string;
  existing?: OperatorReport[];
}): OperatorReport {
  const title = input.title.trim();
  if (!title) {
    throw new ReportsImportError("title is required.");
  }
  const kind = input.kind === undefined || input.kind === "" ? "brief" : input.kind;
  if (!isReportKind(kind)) {
    throw new ReportsImportError(
      `kind must be one of ${REPORT_KINDS.join(", ")}.`,
    );
  }
  const body = (input.body ?? "").trim();
  const blobPointer = asTrimmedString(input.blobPointer);
  if (!body && !blobPointer) {
    throw new ReportsImportError("body or blobPointer is required.");
  }
  const now =
    input.now instanceof Date
      ? input.now
      : typeof input.now === "string"
        ? new Date(input.now)
        : new Date();
  const createdAt = normalizeReportDayKey(input.createdAt, now);
  const id = asTrimmedString(input.id) ?? nextReportId(input.existing ?? [], createdAt);
  return {
    id,
    title,
    kind,
    createdAt,
    body,
    blobPointer,
    fingerprint: fingerprintReportContent({ title, kind, createdAt, body }),
    attestationStatus: REPORT_ATTESTATION_NOT_YET,
    attestLink: null,
    filedAt: now.toISOString(),
  };
}

export function coerceStoredReport(
  raw: unknown,
  index: number,
): OperatorReport | null {
  if (!isRecord(raw)) return null;
  const title = asString(raw.title).trim();
  const body = asString(raw.body).trim();
  const blobPointer = asTrimmedString(raw.blobPointer);
  if (!title || (!body && !blobPointer)) return null;
  if (!isReportKind(raw.kind)) return null;
  const createdAtRaw = asTrimmedString(raw.createdAt);
  if (!createdAtRaw) return null;
  let createdAt: string;
  try {
    createdAt = chicagoDayKey(createdAtRaw);
  } catch {
    return null;
  }
  const id = asTrimmedString(raw.id) ?? `R-${createdAt}-${String(index + 1).padStart(2, "0")}`;
  const filedAt = asString(raw.filedAt) || createdAt;
  const storedFingerprint = asTrimmedString(raw.fingerprint);
  const fingerprint =
    storedFingerprint && /^[a-f0-9]{64}$/i.test(storedFingerprint)
      ? storedFingerprint.toLowerCase()
      : fingerprintReportContent({ title, kind: raw.kind, createdAt, body });
  return {
    id,
    title,
    kind: raw.kind,
    createdAt,
    body,
    blobPointer,
    fingerprint,
    attestationStatus: REPORT_ATTESTATION_NOT_YET,
    attestLink: asTrimmedString(raw.attestLink),
    filedAt,
  };
}

export function sortReports(reports: OperatorReport[]): OperatorReport[] {
  return [...reports].sort((a, b) => {
    const day = b.createdAt.localeCompare(a.createdAt);
    if (day !== 0) return day;
    const filed = b.filedAt.localeCompare(a.filedAt);
    if (filed !== 0) return filed;
    return a.id.localeCompare(b.id);
  });
}

export function mergeReportsById(
  current: OperatorReport[],
  incoming: OperatorReport[],
): OperatorReport[] {
  const map = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) {
    map.set(row.id, row);
  }
  return sortReports(Array.from(map.values()));
}

export function removeReportById(
  reports: OperatorReport[],
  id: string,
): OperatorReport[] {
  return reports.filter((row) => row.id !== id);
}

export function reportsForDay(
  reports: OperatorReport[],
  dayKey: string,
): OperatorReport[] {
  const key = chicagoDayKey(dayKey);
  return sortReports(reports.filter((row) => row.createdAt === key));
}
