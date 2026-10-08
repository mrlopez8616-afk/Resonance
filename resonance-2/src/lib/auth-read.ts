import { NextResponse } from "next/server";
import { SESSION_COOKIE, readCookieValue } from "@/lib/auth-core";
import { sessionCookieHeader } from "@/lib/auth-cookie";
import { authorizePresentedCredentials } from "@/lib/auth-store";

export type ReadAccess =
  | { ok: true; via: "session" | "bearer"; resetCookie: boolean; token: string | null }
  | { ok: false; response: NextResponse };

export async function authorizeReadRequest(request: Request): Promise<ReadAccess> {
  const access = await authorizePresentedCredentials({
    cookieToken: readCookieValue(request.headers.get("cookie"), SESSION_COOKIE),
    authorization: request.headers.get("authorization"),
  });
  if (!access.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: access.error },
        { status: access.status, headers: { "cache-control": "no-store" } },
      ),
    };
  }
  return access;
}

export function finishAuthorizedRead(response: Response, access: ReadAccess): Response {
  if (!access.ok || !access.resetCookie || !access.token) return response;
  const headers = new Headers(response.headers);
  headers.append("set-cookie", sessionCookieHeader(access.token));
  return new Response(response.body, { status: response.status, headers });
}
