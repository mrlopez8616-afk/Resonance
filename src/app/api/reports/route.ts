import { NextResponse } from "next/server";
import { isIsoDayKey } from "@/lib/reports";
import {
  asReportWriteError,
  isReportsSyncConfigured,
  loadReportById,
  loadReportsForDay,
  loadReportsStore,
  mergeReportsWrite,
} from "@/lib/reports-store";
import { authorizeDecisionRequest } from "@/lib/sync-auth";
import type { OperatorReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

function unauthorized(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 401 });
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
    const written = await mergeReportsWrite(body);
    return NextResponse.json({
      ok: true,
      configured: true,
      backend: written.backend,
      seeded: written.seeded,
      updatedAt: written.envelope.updatedAt,
      report: written.filed[0] ?? null,
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
