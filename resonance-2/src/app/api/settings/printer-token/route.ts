import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/auth-core";
import { requireRole } from "@/lib/auth-session";
import { hashPrinterToken, newPrinterToken } from "@/lib/printer";
import { savePrinterTokenHash } from "@/lib/printer-store";
import { requestIsPublicMode } from "@/lib/public-mode-server";
import { FITNESS_TOKEN_HEADER, readBearerToken } from "@/lib/sync-auth-core";
import { isStorageUnavailable } from "@/lib/storage-unavailable";

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
  if (request.headers.get(FITNESS_TOKEN_HEADER)?.trim()) return true;
  if (request.headers.get("x-resonance-token")?.trim()) return true;
  if (request.headers.get("x-factorio-token")?.trim()) return true;
  if (request.headers.get("x-printer-token")?.trim()) return true;
  if (request.headers.get("x-obs-token")?.trim()) return true;
  return false;
}

/**
 * Owner session only. The plaintext token is the response body, shown once
 * by the Integrations page. Only the sha256 digest is stored. This route
 * does not log the token. Public mode and machine credentials do not receive it.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return json(403, { ok: false, error: "Forbidden." });
  if (machineCredential(request)) return json(401, { ok: false, error: "Unauthorized." });

  const gate = await requireRole("owner", request);
  if (gate instanceof NextResponse) return gate;
  if (await requestIsPublicMode(request)) return json(404, { ok: false, error: "Private." });

  const token = newPrinterToken();
  try {
    await savePrinterTokenHash(hashPrinterToken(token));
  } catch (error) {
    const reason = isStorageUnavailable(error) ? error.reason : "token save failed";
    console.error("printer token rotate failed", reason);
    return json(503, { ok: false, error: "Could not store the token." });
  }
  return json(200, { ok: true, token });
}
