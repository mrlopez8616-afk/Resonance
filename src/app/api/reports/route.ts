import { NextResponse } from "next/server";
import { loadDecisionsStore } from "@/lib/decisions-store";
import {
  draftReportFromDecision,
  isIsoDayKey,
  ReportsImportError,
  type OperatorReport,
} from "@/lib/reports";
import {
  asReportWriteError,
  isReportsSyncConfigured,
  loadReportById,
  loadReportsForDay,
  loadReportsStore,
  mergeReportsWrite,
} from "@/lib/reports-store";
import { authorizeDecisionRequest } from "@/lib/sync-auth";

export const dynamic = "force-dynamic";

function unauthorized(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 401 });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function expandReportWriteBody(body: unknown): Promise<unknown> {
  if (!isRecord(body)) return body;
  const fromDecisionId =
    (typeof body.fromDecisionId === "string" && body.fromDecisionId.trim()) ||
    (typeof body.decisionId === "string" &&
    !("title" in body) &&
    !("body" in body)
      ? body.decisionId.trim()
      : "");
  if (!fromDecisionId) return body;

  const loaded = await loadDecisionsStore();
  const decision = loaded.envelope.decisions.find((row) => row.id === fromDecisionId);
  if (!decision) {
    throw new ReportsImportError(
      `Decision ${fromDecisionId} was not found in the shared store.`,
    );
  }
  const dayKey =
    typeof body.dayKey === "string"
      ? body.dayKey
      : typeof body.createdAt === "string"
        ? body.createdAt
        : null;
  const draft = draftReportFromDecision(decision, { dayKey });
  const overrideBody = typeof body.body === "string" ? body.body : "";
  const overrideTitle = typeof body.title === "string" ? body.title.trim() : "";
  return {
    title: overrideTitle || draft.title,
    kind: body.kind ?? draft.kind,
    body: overrideBody.trim() ? overrideBody : draft.body,
    createdAt: draft.createdAt,
    id: typeof body.id === "string" ? body.id : undefined,
  };
}

function notConfigured() {
  return NextResponse.json(
    {
      ok: false,
      configured: false,
      error:
        "Report sync is not configured. In Vercel: Storage → Create Blob store → connect this project → redeploy. See docs/decision-sync.md.",
    },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  const auth = authorizeDecisionRequest(request);
  if (!auth.ok) return unauthorized(auth.error);
  if (!isReportsSyncConfigured()) return notConfigured();

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();
    const day = url.searchParams.get("day")?.trim();

    if (id) {
      const loaded = await loadReportById(id);
      const reports: OperatorReport[] = loaded.report ? [loaded.report] : [];
      return NextResponse.json({
        ok: true,
        configured: true,
        backend: loaded.backend,
        seeded: loaded.seeded,
        updatedAt: loaded.envelope.updatedAt,
        report: loaded.report,
        reports,
      });
    }

    if (day) {
      if (!isIsoDayKey(day)) {
        return NextResponse.json(
          { ok: false, error: "day must be YYYY-MM-DD." },
          { status: 400 },
        );
      }
      const loaded = await loadReportsForDay(day);
      return NextResponse.json({
        ok: true,
        configured: true,
        backend: loaded.backend,
        seeded: loaded.seeded,
        updatedAt: loaded.envelope.updatedAt,
        day,
        reports: loaded.reports,
      });
    }

    const loaded = await loadReportsStore();
    return NextResponse.json({
      ok: true,
      configured: true,
      backend: loaded.backend,
      seeded: loaded.seeded,
      updatedAt: loaded.envelope.updatedAt,
      reports: loaded.envelope.reports,
    });
  } catch (error) {
    const mapped = asReportWriteError(error);
    return NextResponse.json(
      { ok: false, error: mapped.message },
      { status: mapped.status },
    );
  }
}

export async function POST(request: Request) {
  const auth = authorizeDecisionRequest(request);
  if (!auth.ok) return unauthorized(auth.error);
  if (!isReportsSyncConfigured()) return notConfigured();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON body is required." },
      { status: 400 },
    );
  }

  try {
    const expanded = await expandReportWriteBody(body);
    const written = await mergeReportsWrite(expanded);
    const report = written.filed[0] ?? null;
    return NextResponse.json({
      ok: true,
      configured: true,
      backend: written.backend,
      seeded: written.seeded,
      updatedAt: written.envelope.updatedAt,
      report,
      reports: written.envelope.reports,
    });
  } catch (error) {
    const mapped = asReportWriteError(error);
    return NextResponse.json(
      { ok: false, error: mapped.message },
      { status: mapped.status },
    );
  }
}
