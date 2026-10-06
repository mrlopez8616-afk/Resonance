import { NextResponse } from "next/server";
import { redactConnectionDetails } from "@/lib/pg/client";
import { migrate } from "@/lib/pg/migrate";
import { authorizeSyncRequest } from "@/lib/sync-auth";
import { isStorageUnavailable } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

function unauthorized(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 401 });
}

/**
 * Apply db/migrations. Same path as `npm run db:migrate`, including the
 * transaction advisory lock. A second call is a no-op.
 */
export async function POST(request: Request) {
  const auth = authorizeSyncRequest(request);
  if (!auth.ok) return unauthorized(auth.error);
  if (!process.env.DATABASE_URL?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Postgres is not configured" },
      { status: 503 },
    );
  }

  try {
    const result = await migrate();
    return NextResponse.json({ applied: result.applied, skipped: result.skipped });
  } catch (error) {
    const reason = isStorageUnavailable(error)
      ? error.reason
      : redactConnectionDetails(error instanceof Error ? error.message : "Migration failed.");
    console.error("db migrate failed", reason);
    return NextResponse.json(
      { ok: false, error: reason },
      { status: isStorageUnavailable(error) ? 503 : 500 },
    );
  }
}
