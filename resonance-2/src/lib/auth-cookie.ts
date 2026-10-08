import { NextResponse } from "next/server";
import { PASSKEY_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE_SEC } from "@/lib/auth-core";

export function sessionCookieHeader(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_MAX_AGE_SEC}; HttpOnly; Secure; SameSite=Lax`;
}

const base = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};

export function attachSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    ...base,
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    ...base,
    maxAge: 0,
  });
}

export function attachPasskeyCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: PASSKEY_COOKIE,
    value: token,
    ...base,
    maxAge: 5 * 60,
  });
}

export function clearPasskeyCookie(response: NextResponse): void {
  response.cookies.set({
    name: PASSKEY_COOKIE,
    value: "",
    ...base,
    maxAge: 0,
  });
}
