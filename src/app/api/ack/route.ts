import { NextResponse } from "next/server";
import {
  asWriteError,
  ackStoredDecision,
  isDecisionsSyncConfigured,
} from "@/lib/decisions-store";
import { authorizeDecisionRequest } from "@/lib/sync-auth";

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

/** Operator view-ack only. Does not submit to Hedera. Use POST /api/attest for HCS. */
export async function POST(request: Request) {
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

  const id =
    typeof body === "object" &&
    body !== null &&
    "id" in body &&
    typeof body.id === "string"
      ? body.id.trim()
      : "";
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id is required to ack a decision." },
      { status: 400 },
    );
  }

  try {
    const written = await ackStoredDecision(id);
    if (!written.found) {
      return NextResponse.json(
        { ok: false, error: `Decision ${id} was not found.` },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ok: true,
      mode: "operator_ack",
      configured: true,
      backend: written.backend,
      updatedAt: written.envelope.updatedAt,
      decision: written.decision,
    });
  } catch (error) {
    const mapped = asWriteError(error);
    return NextResponse.json(
      { ok: false, error: mapped.message },
      { status: mapped.status },
    );
  }
}
