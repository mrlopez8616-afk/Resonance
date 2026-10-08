import { NextResponse } from "next/server";
import { authorizeFinanceIngest, getFinanceIngestToken } from "@/lib/finance/auth";
import { financeKeyFromEnv } from "@/lib/finance/crypto";
import { parseFinanceSnapshot, type FinanceSnapshot } from "@/lib/finance/schema";
import { readOwnerFinanceSnapshot, writeFinanceSnapshot } from "@/lib/finance/store";
import { isStorageUnavailable } from "@/lib/storage-unavailable";
import { readBearerToken } from "@/lib/sync-auth-core";

export const dynamic = "force-dynamic";

const MAX_BYTES = 256 * 1024;

type FinanceJson = {
  ok: boolean;
  error?: string;
  deduped?: boolean;
  asOf?: string;
  storedAt?: string;
  snapshot?: FinanceSnapshot | null;
};

function json(body: FinanceJson, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/** Test hook. `undefined` uses the session cookie. */
let sessionForTests: { role: string } | null | undefined;

export function setFinanceSessionForTests(session: { role: string } | null | undefined) {
  sessionForTests = session;
}

/**
 * Owner session read. Bearer is rejected. Zero rows is 200 `{ snapshot: null }`.
 * Missing env or an unreachable database is 503.
 */
export async function GET(request: Request) {
  if (request.headers.get("authorization")) {
    return json({ ok: false, error: "Unauthorized." }, 401);
  }
  let session: { role: string } | null = null;
  if (sessionForTests !== undefined) {
    session = sessionForTests;
  } else {
    try {
      const { getSession } = await import("@/lib/auth-session");
      session = await getSession();
    } catch {
      session = null;
    }
  }
  if (!session || session.role !== "owner") {
    return json({ ok: false, error: "Unauthorized." }, 401);
  }
  const read = await readOwnerFinanceSnapshot();
  if (!read.ok) return json({ ok: false, error: read.error }, read.status);
  return json({ ok: true, snapshot: read.snapshot }, 200);
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
