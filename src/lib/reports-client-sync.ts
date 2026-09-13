import { messageFromApiFailure, readApiJson } from "./api-client";
import type { OperatorReport, ReportKind } from "./reports";

export type ReportsSyncState =
  | { status: "idle"; reports: OperatorReport[] }
  | { status: "checking"; reports: OperatorReport[] }
  | {
      status: "synced";
      backend: string;
      updatedAt: string | null;
      reports: OperatorReport[];
      seeded?: boolean;
    }
  | { status: "local"; reason: string; reports: OperatorReport[] }
  | { status: "error"; message: string; reports: OperatorReport[] };

const listeners = new Set<() => void>();
let snapshot: ReportsSyncState = { status: "idle", reports: [] };

function emit() {
  for (const listener of listeners) listener();
}

function setSnapshot(next: ReportsSyncState) {
  snapshot = next;
  emit();
}

export function subscribeReportsSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getReportsSyncSnapshot(): ReportsSyncState {
  return snapshot;
}

export function getServerReportsSyncSnapshot(): ReportsSyncState {
  return { status: "idle", reports: [] };
}

export async function pullServerReports(query?: {
  day?: string;
  id?: string;
}): Promise<
  | {
      ok: true;
      reports: OperatorReport[];
      report: OperatorReport | null;
      updatedAt: string | null;
      backend: string;
      seeded?: boolean;
    }
  | { ok: false; reason: "local" | "auth" | "error"; message: string }
> {
  try {
    const params = new URLSearchParams();
    if (query?.day) params.set("day", query.day);
    if (query?.id) params.set("id", query.id);
    const qs = params.toString();
    const response = await fetch(qs ? `/api/reports?${qs}` : "/api/reports", {
      credentials: "include",
    });
    if (response.status === 503) {
      return {
        ok: false,
        reason: "local",
        message: "Shared store is not configured yet. This browser stays local.",
      };
    }
    if (response.status === 401) {
      return {
        ok: false,
        reason: "auth",
        message: "Unlock the site to pull the reports binder.",
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        reason: "error",
        message: "Could not read the reports binder.",
      };
    }
    const body = (await response.json()) as {
      reports?: OperatorReport[];
      report?: OperatorReport | null;
      updatedAt?: string | null;
      backend?: string;
      seeded?: boolean;
    };
    if (!Array.isArray(body.reports)) {
      return {
        ok: false,
        reason: "error",
        message: "Shared store returned an unexpected payload.",
      };
    }
    return {
      ok: true,
      reports: body.reports,
      report: body.report ?? body.reports[0] ?? null,
      updatedAt: body.updatedAt ?? null,
      backend: body.backend ?? "unknown",
      seeded: body.seeded,
    };
  } catch {
    return {
      ok: false,
      reason: "error",
      message: "Network error talking to the reports binder.",
    };
  }
}

export async function hydrateReportsFromServer(query?: {
  day?: string;
  id?: string;
}): Promise<ReportsSyncState> {
  setSnapshot({ ...snapshot, status: "checking" });
  const pulled = await pullServerReports(query);
  if (!pulled.ok) {
    const next: ReportsSyncState =
      pulled.reason === "error"
        ? { status: "error", message: pulled.message, reports: snapshot.reports }
        : { status: "local", reason: pulled.message, reports: snapshot.reports };
    setSnapshot(next);
    return next;
  }
  const next: ReportsSyncState = {
    status: "synced",
    backend: pulled.backend,
    updatedAt: pulled.updatedAt,
    reports: pulled.reports,
    seeded: pulled.seeded,
  };
  setSnapshot(next);
  return next;
}

export async function fileReportOnServer(input: {
  title?: string;
  kind?: ReportKind;
  body?: string;
  createdAt?: string;
  dayKey?: string;
  fromDecisionId?: string;
}): Promise<
  | { ok: true; report: OperatorReport; reports: OperatorReport[] }
  | { ok: false; status: number; message: string }
> {
  try {
    const response = await fetch("/api/reports", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const parsed = await readApiJson<{
      error?: string;
      reports?: OperatorReport[];
      report?: OperatorReport | null;
    }>(response, "Could not file this report.");
    if (!parsed.parsed) {
      return {
        ok: false,
        status: parsed.status,
        message: parsed.message,
      };
    }
    const body = parsed.body;
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: messageFromApiFailure(
          response.status,
          body.error,
          "Could not file this report.",
        ),
      };
    }
    const reports = Array.isArray(body.reports) ? body.reports : snapshot.reports;
    const report =
      body.report ??
      reports.find((row) => row.title === input.title && row.body === input.body) ??
      reports[0];
    if (!report) {
      return {
        ok: false,
        status: response.status,
        message: "Store accepted the file but returned no report.",
      };
    }
    setSnapshot({
      status: "synced",
      backend: snapshot.status === "synced" ? snapshot.backend : "unknown",
      updatedAt: snapshot.status === "synced" ? snapshot.updatedAt : null,
      reports,
    });
    return { ok: true, report, reports };
  } catch {
    return {
      ok: false,
      status: 0,
      message: "Network error talking to the reports binder.",
    };
  }
}

export function applyReportPatch(
  id: string,
  patch: Partial<OperatorReport>,
): OperatorReport[] {
  const reports = snapshot.reports.map((row) =>
    row.id === id ? { ...row, ...patch } : row,
  );
  setSnapshot({
    ...snapshot,
    reports,
  });
  return reports;
}

export async function attestReportOnServer(
  id: string,
): Promise<
  | {
      ok: true;
      report: OperatorReport;
      messageId: string | null;
      explorerUrl: string | null;
      topicId: string | null;
      note?: string;
    }
  | { ok: false; status: number; message: string }
> {
  try {
    const response = await fetch("/api/attest", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const parsed = await readApiJson<{
      error?: string;
      report?: OperatorReport;
      note?: string;
      hedera?: {
        messageId?: string | null;
        explorerUrl?: string | null;
        topicId?: string | null;
      };
    }>(response, "Could not attest this report.");
    if (!parsed.parsed) {
      return {
        ok: false,
        status: parsed.status,
        message: parsed.message,
      };
    }
    const body = parsed.body;
    if (!response.ok || !body.report) {
      return {
        ok: false,
        status: response.status,
        message: messageFromApiFailure(
          response.status,
          body.error,
          "Could not attest this report.",
        ),
      };
    }
    applyReportPatch(body.report.id, body.report);
    return {
      ok: true,
      report: body.report,
      messageId: body.hedera?.messageId ?? body.report.hederaMessageId,
      explorerUrl: body.hedera?.explorerUrl ?? body.report.attestLink,
      topicId: body.hedera?.topicId ?? null,
      note: body.note,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      message: "Network error talking to the attest endpoint.",
    };
  }
}
