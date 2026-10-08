import { NextResponse } from "next/server";
import { authorizeReadRequest, finishAuthorizedRead } from "@/lib/auth-read";
import { loadFitnessNode } from "@/lib/fitness-store";

export const dynamic = "force-dynamic";

/** Session cookie or `Authorization: Bearer $RESONANCE_SYNC_SECRET`, same as the other reads. */
export async function GET(request: Request) {
  const access = await authorizeReadRequest(request);
  if (!access.ok) return access.response;
  const loaded = await loadFitnessNode("runs");
  const detail = loaded.detail;
  return finishAuthorizedRead(
    NextResponse.json({
      ok: true,
      availability: loaded.availability,
      headline: detail?.headline ?? null,
      detail: detail?.headline ? detail.detail : null,
      runs: detail?.rows ?? [],
      weeks: detail?.weeks ?? [],
      months: detail?.months ?? [],
      pace: detail?.pace ?? [],
    }),
    access,
  );
}
