import { NextResponse } from "next/server";
import { readStorageStatus } from "@/lib/pg/status";

export const dynamic = "force-dynamic";

/** Public, secret-free check that production is on Postgres and migrated. */
export async function GET() {
  const status = await readStorageStatus();
  return NextResponse.json(status, {
    headers: { "Cache-Control": "no-store" },
  });
}
