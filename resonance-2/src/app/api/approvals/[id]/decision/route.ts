import { NextResponse } from "next/server";
import { parseDecisionBody, toApprovalJson } from "@/lib/approvals";
import { decideApproval } from "@/lib/approvals-store";
import { isSameOriginRequest } from "@/lib/auth-core";
import { requireRole } from "@/lib/auth-session";
import { privateModeResponse, requestIsPublicMode } from "@/lib/public-mode-server";
import { isStorageUnavailable, storageErrorJson } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/**
 * Record approved or declined. Owner session only.
 * The sync Bearer cannot decide. A second decision returns 409.
 * This writes the row and stops. It does not trade, transfer, or call out.
 *
 * Operator: `users.role` allows operator and `decided_by` can store it, but
 * this deploy still rejects that login. `readSessionPresentation` drops a
 * live operator session, so the decision stays owner-only.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (request.headers.get("authorization")) {
    return json(401, { ok: false, error: "Unauthorized." });
  }
  const gate = await requireRole("owner", request);
  if (gate instanceof NextResponse) return gate;
  if (!isSameOriginRequest(request)) return json(403, { ok: false, error: "Forbidden." });
  if (await requestIsPublicMode(request)) return privateModeResponse();

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "JSON body is required." });
  }
  const parsed = parseDecisionBody(body);
  if (!parsed.ok) return json(parsed.status, { ok: false, error: parsed.error });

  try {
    const result = await decideApproval(id, parsed.draft.decision, parsed.draft.note);
    if (!result.ok) return json(result.status, { ok: false, error: result.error });
    return json(200, {
      ok: true,
      executed: false,
      approval: toApprovalJson(result.approval),
    });
  } catch (error) {
    if (isStorageUnavailable(error)) {
      return NextResponse.json(storageErrorJson(error), {
        status: 503,
        headers: { "cache-control": "no-store" },
      });
    }
    console.error("approval decision failed", error instanceof Error ? error.message : "unknown");
    return json(500, { ok: false, error: "Approvals are unavailable." });
  }
}
