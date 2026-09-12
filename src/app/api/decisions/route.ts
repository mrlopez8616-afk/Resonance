import { NextResponse } from "next/server";
import {
  asWriteError,
  deleteStoredDecision,
  isDecisionsSyncConfigured,
  loadDecisionsStore,
  mergeDecisionsWrite,
} from "@/lib/decisions-store";
import { authorizeDecisionRequest } from "@/lib/sync-auth";
import type { Decision } from "@/lib/types";

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
        "Decision sync is not configured. In Vercel: Storage → Create Blob store → connect this project → redeploy. See docs/decision-sync.md.",
    },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  const auth = authorizeDecisionRequest(request);
  if (!auth.ok) return unauthorized(auth.error);
  if (!isDecisionsSyncConfigured()) return notConfigured();

  try {
    const loaded = await loadDecisionsStore();
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();
    const decisions: Decision[] = id
      ? loaded.envelope.decisions.filter((row) => row.id === id)
      : loaded.envelope.decisions;
    return NextResponse.json({
      ok: true,
      configured: true,
      backend: loaded.backend,
      seeded: loaded.seeded,
      updatedAt: loaded.envelope.updatedAt,
      decisions,
    });
  } catch (error) {
    const mapped = asWriteError(error);
    return NextResponse.json(
      { ok: false, error: mapped.message },
      { status: mapped.status },
    );
  }
}

async function write(request: Request) {
  const auth = authorizeDecisionRequest(request);
  if (!auth.ok) return unauthorized(auth.error);
  if (!isDecisionsSyncConfigured()) return notConfigured();

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
    const written = await mergeDecisionsWrite(body);
    return NextResponse.json({
      ok: true,
      configured: true,
      backend: written.backend,
      seeded: written.seeded,
      updatedAt: written.envelope.updatedAt,
      decisions: written.envelope.decisions,
    });
  } catch (error) {
    const mapped = asWriteError(error);
    return NextResponse.json(
      { ok: false, error: mapped.message },
      { status: mapped.status },
    );
  }
}

export async function POST(request: Request) {
  return write(request);
}

export async function PATCH(request: Request) {
  return write(request);
}

export async function DELETE(request: Request) {
  const auth = authorizeDecisionRequest(request);
  if (!auth.ok) return unauthorized(auth.error);
  if (!isDecisionsSyncConfigured()) return notConfigured();

  const url = new URL(request.url);
  let id = url.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    try {
      const body = (await request.json()) as { id?: unknown };
      if (typeof body.id === "string") id = body.id.trim();
    } catch {
      id = "";
    }
  }
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id is required to delete a decision." },
      { status: 400 },
    );
  }

  try {
    const written = await deleteStoredDecision(id);
    return NextResponse.json({
      ok: true,
      configured: true,
      backend: written.backend,
      found: written.found,
      updatedAt: written.envelope.updatedAt,
      decisions: written.envelope.decisions,
    });
  } catch (error) {
    const mapped = asWriteError(error);
    return NextResponse.json(
      { ok: false, error: mapped.message },
      { status: mapped.status },
    );
  }
}
