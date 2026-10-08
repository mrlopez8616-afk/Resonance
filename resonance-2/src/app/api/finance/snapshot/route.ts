import { NextResponse } from "next/server";
import { authorizeFinanceIngest, getFinanceIngestToken } from "@/lib/finance/auth";
import { financeKeyFromEnv } from "@/lib/finance/crypto";
import { parseFinanceSnapshot } from "@/lib/finance/schema";
import { writeFinanceSnapshot } from "@/lib/finance/store";
import { isStorageUnavailable } from "@/lib/storage-unavailable";
import { readBearerToken } from "@/lib/sync-auth-core";

export const dynamic = "force-dynamic";

const MAX_BYTES = 256 * 1024;

function json(body: { ok: boolean; error?: string; deduped?: boolean; asOf?: string; storedAt?: string }, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/**
 * Finance has no Bearer read. A session still does not receive the snapshot
 * here: owner pages read the store in the server component.
 */
export async function GET(request: Request) {
  if (request.headers.get("authorization")) {
    return json({ ok: false, error: "Unauthorized." }, 401);
  }
  let session: { role: string } | null = null;
  try {
    const { getSession } = await import("@/lib/auth-session");
    session = await getSession();
  } catch {
    session = null;
  }
  if (!session || session.role !== "owner") {
    return json({ ok: false, error: "Unauthorized." }, 401);
  }
  return json({ ok: false, error: "Not found." }, 404);
}

export function HEAD(request: Request) {
  return GET(request);
}

/**
 * One aggregates-only snapshot.
 * Header: `Authorization: Bearer <FINANCE_INGEST_TOKEN>`.
 * Unset token or encryption key fails closed. The hub sync secret is not accepted.
 * There is no Blob fallback.
 */
export async function POST(request: Request) {
  const auth = authorizeFinanceIngest({
    token: getFinanceIngestToken(),
    bearer: readBearerToken(request.headers.get("authorization")),
  });
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  if (!financeKeyFromEnv()) {
    return json({ ok: false, error: "Finance encryption is not configured." }, 503);
  }
  if (!process.env.DATABASE_URL?.trim()) {
    return json({ ok: false, error: "Postgres is not configured." }, 503);
  }

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return json({ ok: false, error: "Snapshot is too large." }, 413);
  }

  let raw = "";
  try {
    raw = await request.text();
  } catch {
    return json({ ok: false, error: "JSON body is required." }, 400);
  }
  if (Buffer.byteLength(raw) > MAX_BYTES) {
    return json({ ok: false, error: "Snapshot is too large." }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "JSON body is required." }, 400);
  }

  const parsed = parseFinanceSnapshot(body);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);

  try {
    const stored = await writeFinanceSnapshot(parsed.value, parsed.canonical);
    return json({ ok: true, ...stored }, 200);
  } catch (error) {
    console.error("finance snapshot was not stored");
    return json(
      { ok: false, error: "Finance snapshot was not stored." },
      isStorageUnavailable(error) ? 503 : 500,
    );
  }
}
