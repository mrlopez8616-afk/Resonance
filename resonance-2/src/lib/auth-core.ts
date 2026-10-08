import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type EnvLike = Record<string, string | undefined>;

export const SESSION_COOKIE = "__Host-resonance_session";
export const PASSKEY_COOKIE = "__Host-resonance_passkey";
export const PATH_HEADER = "x-resonance-pathname";
export const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60;
export const SESSION_MS = SESSION_MAX_AGE_SEC * 1000;
export const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;
export const IP_WINDOW_MS = 15 * 60 * 1000;
export const IP_MAX_FAILURES = 5;
export const GLOBAL_LOCK_EVERY = 5;
export const GLOBAL_BACKOFF_START_SEC = 60;
export const GLOBAL_BACKOFF_MAX_SEC = 60 * 60;
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const PASSKEY_USER_NAME = "andres";
export const OWNER_USERNAME = "andres";

export type UserRole = "owner" | "operator";

/** Blank means the owner. Any other name is not accepted in this deploy. */
export function isOwnerUsername(value: string | null | undefined): boolean {
  const name = value?.trim().toLowerCase() ?? "";
  return name.length === 0 || name === OWNER_USERNAME;
}

export const READ_ROUTES = [
  "GET /api/bets",
  "GET /api/calendar",
  "GET /api/fills",
  "GET /api/sleeves",
  "GET /api/spot-price",
  "GET /api/xrp-price",
  "GET /api/portfolio-mood",
  "GET /api/fights/breakdown?event=",
] as const;

export const MACHINE_ROUTES = [
  "POST /api/bets",
  "POST /api/bets/settle",
  "POST /api/fights/result",
  "POST /api/calendar",
  "POST /api/storage/migrate",
  "POST /api/storage/import",
  "POST /api/fills",
  "POST /api/fitness/ingest",
  "POST /api/fights/breakdown",
] as const;

const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/;

let nowFn: () => number = () => Date.now();

export function authNow(): number {
  return nowFn();
}

export function setAuthClockForTests(fn: (() => number) | null): void {
  nowFn = fn ?? (() => Date.now());
}

export function isLoginConfigured(env: EnvLike = process.env): boolean {
  return Boolean(
    env.AUTH_PASSWORD_HASH?.trim() &&
      env.AUTH_TOTP_SECRET?.trim() &&
      env.AUTH_SESSION_SECRET?.trim(),
  );
}

export function getSessionSecret(env: EnvLike = process.env): string {
  const secret = env.AUTH_SESSION_SECRET?.trim() ?? "";
  if (!secret) throw new Error("AUTH_SESSION_SECRET is not set.");
  return secret;
}

export function isSessionToken(value: string | null | undefined): value is string {
  return typeof value === "string" && SESSION_TOKEN.test(value);
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionId(token: string, env: EnvLike = process.env): string {
  return createHmac("sha256", getSessionSecret(env)).update(token).digest("hex");
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

const HOST_HEADER =
  /^(?:localhost|\[::1\]|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*)(?::\d{1,5})?$/i;

/**
 * Origin the browser actually used. Route handlers see the bind address
 * (0.0.0.0) in request.url when the server listens on all interfaces, which
 * breaks WebAuthn's RP ID after a redirect.
 */
export function requestOrigin(request: Request): string {
  const host = request.headers.get("host")?.trim().toLowerCase() ?? "";
  if (HOST_HEADER.test(host)) {
    const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
    const local = host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
    const proto = forwarded === "http" || forwarded === "https" ? forwarded : local ? "http" : "https";
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim() ?? "";
  if (first) return first.slice(0, 80);
  const real = request.headers.get("x-real-ip")?.trim() ?? "";
  return real ? real.slice(0, 80) : "unknown";
}

export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = (userAgent ?? "").slice(0, 300);
  let browser = "Browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";
  let os = "Unknown";
  if (/iPhone|iPad/.test(ua)) os = "iOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Macintosh|Mac OS X/.test(ua)) os = "macOS";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Linux/.test(ua)) os = "Linux";
  return `${browser} on ${os}`.slice(0, 80);
}

export function readCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === name) {
      const value = trimmed.slice(eq + 1);
      return value || null;
    }
  }
  return null;
}

export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value.includes("://") || value.includes("\\")) return "/";
  if (value.startsWith("/login")) return "/";
  return value;
}

export function isPublicAsset(pathname: string): boolean {
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico" || pathname === "/robots.txt") return true;
  if (pathname === "/manifest.webmanifest" || pathname === "/manifest.json") return true;
  if (pathname === "/icon" || pathname.startsWith("/icon.")) return true;
  if (pathname === "/apple-icon" || pathname.startsWith("/apple-icon.")) return true;
  if (pathname.startsWith("/icons/")) return true;
  return /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/i.test(pathname);
}

export function isAuthApi(pathname: string): boolean {
  return pathname === "/api/auth" || pathname.startsWith("/api/auth/");
}

export function isLoginPage(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/");
}

export type AccessPlan =
  | { kind: "allow" }
  | { kind: "allow-session" }
  | { kind: "redirect"; next: string }
  | { kind: "deny" };

/**
 * Fast gate. Pages with a well-formed cookie are allowed through for the
 * layout to check the database. GET /api with only a cookie is `allow-session`
 * so the proxy can reject a revoked row. Writes stay on their own Bearer checks.
 */
export function planAccess(input: {
  pathname: string;
  method: string;
  sessionToken: string | null;
  bearerOk: boolean;
  loginConfigured: boolean;
  nextPath: string;
}): AccessPlan {
  const { pathname } = input;
  if (isPublicAsset(pathname) || isAuthApi(pathname) || isLoginPage(pathname)) {
    return { kind: "allow" };
  }
  const method = input.method.toUpperCase();
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    if (method !== "GET" && method !== "HEAD") return { kind: "allow" };
    if (input.bearerOk) return { kind: "allow" };
    if (input.loginConfigured && isSessionToken(input.sessionToken)) {
      return { kind: "allow-session" };
    }
    return { kind: "deny" };
  }
  if (input.loginConfigured && isSessionToken(input.sessionToken)) {
    return { kind: "allow" };
  }
  return { kind: "redirect", next: safeNextPath(input.nextPath) };
}

export function needsRenewal(renewedAtMs: number, now: number): boolean {
  return now - renewedAtMs >= RENEW_AFTER_MS;
}

export function globalLockoutAfterFailure(
  state: { failures: number; backoffSec: number },
  now: number,
): { failures: number; lockedUntil: number | null; backoffSec: number } {
  const failures = state.failures + 1;
  const backoffSec = state.backoffSec > 0 ? state.backoffSec : GLOBAL_BACKOFF_START_SEC;
  if (failures % GLOBAL_LOCK_EVERY === 0) {
    return {
      failures,
      lockedUntil: now + backoffSec * 1000,
      backoffSec: Math.min(backoffSec * 2, GLOBAL_BACKOFF_MAX_SEC),
    };
  }
  return { failures, lockedUntil: null, backoffSec };
}

export type ChallengeKind = "register" | "authenticate";

export function sealChallenge(
  payload: { challenge: string; kind: ChallengeKind },
  secret: string,
  now: number,
): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: now + CHALLENGE_TTL_MS }),
  ).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function openChallenge(
  token: string | null | undefined,
  secret: string,
  now: number,
): { challenge: string; kind: ChallengeKind } | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      challenge?: unknown;
      kind?: unknown;
      exp?: unknown;
    };
    if (typeof parsed.exp !== "number" || parsed.exp < now) return null;
    if (parsed.kind !== "register" && parsed.kind !== "authenticate") return null;
    if (typeof parsed.challenge !== "string" || !parsed.challenge) return null;
    return { challenge: parsed.challenge, kind: parsed.kind };
  } catch {
    return null;
  }
}

export function webauthnConfig(
  env: EnvLike = process.env,
): { rpID: string; origin: string } | null {
  const rpID = env.WEBAUTHN_RP_ID?.trim() ?? "";
  const origin = env.WEBAUTHN_ORIGIN?.trim() ?? "";
  if (!rpID || !origin) return null;
  return { rpID, origin };
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  return copyBytes(new Uint8Array(Buffer.from(value, "base64url")));
}

export function passkeyUserId(): Uint8Array<ArrayBuffer> {
  return copyBytes(new TextEncoder().encode(PASSKEY_USER_NAME));
}
