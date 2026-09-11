import { NextResponse } from "next/server";
import {
  GATE_COOKIE_NAME,
  gateCookieOptions,
  getAppPassword,
  passwordsMatch,
  signGateToken,
} from "@/lib/app-gate";

function isSecureRequest(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) return proto === "https";
  return process.env.NODE_ENV === "production";
}

export async function GET() {
  return NextResponse.json({ required: getAppPassword() !== null });
}

export async function POST(request: Request) {
  const expected = getAppPassword();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "App gate is disabled. Set RESONANCE_APP_PASSWORD on the server." },
      { status: 400 },
    );
  }

  let provided = "";
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { password?: unknown };
      provided = typeof body.password === "string" ? body.password : "";
    } else {
      const form = await request.formData();
      const value = form.get("password");
      provided = typeof value === "string" ? value : "";
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not read password." },
      { status: 400 },
    );
  }

  if (!provided || !passwordsMatch(provided, expected)) {
    return NextResponse.json(
      { ok: false, error: "Incorrect password." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    GATE_COOKIE_NAME,
    signGateToken(expected),
    gateCookieOptions(isSecureRequest(request)),
  );
  return response;
}

export async function DELETE(request: Request) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(GATE_COOKIE_NAME, "", {
    ...gateCookieOptions(isSecureRequest(request)),
    maxAge: 0,
  });
  return response;
}
