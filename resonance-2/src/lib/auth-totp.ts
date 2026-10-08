import { createHash, timingSafeEqual } from "node:crypto";
import { Secret, TOTP } from "otpauth";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Six digits, 30-second step, SHA-1, ±1 step. Always checks all three windows. */
export function totpMatches(secretBase32: string, code: string, now: number): boolean {
  const normalized = code.replace(/\s+/g, "");
  const candidate = /^\d{6}$/.test(normalized) ? normalized : "000000";
  let secret: Secret;
  try {
    secret = Secret.fromBase32(secretBase32.replace(/\s+/g, "").replace(/=+$/g, "").toUpperCase());
  } catch {
    return false;
  }
  const totp = new TOTP({
    issuer: "Resonance",
    label: "Andres",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  let matched = 0;
  for (const step of [-1, 0, 1]) {
    const expected = totp.generate({ timestamp: now + step * 30_000 });
    const same = timingSafeEqual(digest(candidate), digest(expected));
    matched |= same ? 1 : 0;
  }
  if (!/^\d{6}$/.test(normalized)) return false;
  return matched === 1;
}
