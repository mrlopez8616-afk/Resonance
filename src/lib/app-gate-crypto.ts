import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const GATE_COOKIE_NAME = "resonance_gate";
export const GATE_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function passwordsMatch(provided: string, expected: string): boolean {
  const left = sha256(provided);
  const right = sha256(expected);
  return timingSafeEqual(left, right);
}

export function signGateToken(password: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + GATE_MAX_AGE_SECONDS;
  const payload = String(exp);
  const mac = createHmac("sha256", password).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function verifyGateToken(
  password: string,
  token: string | undefined,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return false;
  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const exp = Number(payload);
  if (!Number.isFinite(exp) || Math.floor(now / 1000) > exp) return false;
  const expected = createHmac("sha256", password)
    .update(payload)
    .digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
