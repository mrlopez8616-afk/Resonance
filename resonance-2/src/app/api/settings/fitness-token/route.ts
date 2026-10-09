import { NextResponse } from "next/server";
import { authNow, isSameOriginRequest } from "@/lib/auth-core";
import { requireRole } from "@/lib/auth-session";
import { requestIsPublicMode } from "@/lib/public-mode-server";
import { totpMatches } from "@/lib/auth-totp";
import {
  FITNESS_TOKEN_HEADER,
  getFitnessIngestToken,
  readBearerToken,
} from "@/lib/sync-auth-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(status: number, body: { ok: boolean; error?: string; token?: string }) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function machineCredential(request: Request): boolean {
  if (readBearerToken(request.headers.get("authorization"))) return true;
  return Boolean(request.headers.get(FITNESS_TOKEN_HEADER)?.trim());
}

/**
 * Owner session plus a fresh authenticator code. The sync secret and the
 * fitness header do not reveal the token. The value is not logged.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return json(403, { ok: false, error: "Forbidden." });
  if (machineCredential(request)) return json(401, { ok: false, error: "Unauthorized." });

  const gate = await requireRole("owner", request);
  if (gate instanceof NextResponse) return gate;
  if (await requestIsPublicMode(request)) return json(404, { ok: false, error: "Private." });

  let code = "";
  try {
    const body = (await request.json()) as { code?: unknown };
    code = typeof body.code === "string" ? body.code : "";
  } catch {
    code = "";
  }
  const secret = process.env.AUTH_TOTP_SECRET?.trim() ?? "";
  if (!secret || !totpMatches(secret, code, authNow())) {
    return json(401, { ok: false, error: "Wrong code." });
  }

  const token = getFitnessIngestToken();
  if (!token) return json(503, { ok: false, error: "not configured" });
  return json(200, { ok: true, token });
}
