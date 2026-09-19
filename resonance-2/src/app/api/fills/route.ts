import { NextResponse } from "next/server";
import { listFills } from "@/lib/fills";
import {
  asFillWriteError,
  ingestStoredFill,
  isFillsStoreConfigured,
  liveSleevesFromEnvelope,
  loadFillsStore,
} from "@/lib/fills-store";
import { authorizeFillRequest } from "@/lib/sync-auth";

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
        "Fill ingest is not configured. In Vercel: Storage → Create Blob store → connect resonance3 → redeploy. See cabinet/fill-ingest.md.",
    },
    { status: 503 },
  );
}

export async function GET() {
  try {
    const loaded = await loadFillsStore();
    return NextResponse.json({
      ok: true,
      configured: loaded.configured,
      backend: loaded.backend,
      seeded: loaded.seeded,
      updatedAt: loaded.envelope.updatedAt,
      fills: listFills(loaded.envelope.fills),
    });
  } catch (error) {
    const mapped = asFillWriteError(error);
    return NextResponse.json(
      { ok: false, error: mapped.message },
      { status: mapped.status },
    );
  }
}

export async function POST(request: Request) {
  const auth = authorizeFillRequest(request);
  if (!auth.ok) return unauthorized(auth.error);
  if (!isFillsStoreConfigured()) return notConfigured();

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
    const written = await ingestStoredFill(body);
    const sleeves = liveSleevesFromEnvelope(
      written.envelope,
      written.fill.symbol,
    );
    return NextResponse.json({
      ok: true,
      deduped: written.deduped,
      configured: true,
      backend: written.backend,
      seeded: written.seeded,
      idempotencyKey: written.fill.idempotencyKey,
      fill: written.fill,
      applied: written.applied,
      sleeves: sleeves
        ? { ticker: written.fill.symbol, sleeves }
        : { ticker: written.fill.symbol, sleeves: [] },
      updatedAt: written.envelope.updatedAt,
    });
  } catch (error) {
    const mapped = asFillWriteError(error);
    console.error("fill ingest failed", mapped.message);
    return NextResponse.json(
      { ok: false, error: mapped.message },
      { status: mapped.status },
    );
  }
}
