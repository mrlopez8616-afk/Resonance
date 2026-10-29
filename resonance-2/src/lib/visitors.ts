import { createHmac } from "node:crypto";

const BOT =
  /bot|crawler|spider|slurp|headless|preview|wget|curl|python-requests|go-http-client|monitoring|uptime|facebookexternalhit|embedly/i;

const hits = new Map<string, number[]>();

/** A missing or short agent, or a known crawler, is not a person. */
export function isBot(userAgent: string | null | undefined): boolean {
  const value = (userAgent ?? "").trim();
  if (value.length < 12) return true;
  return BOT.test(value);
}

/** Do Not Track and Global Privacy Control skip the counter. */
export function trackingDeclined(headers: { get(name: string): string | null }): boolean {
  return headers.get("dnt") === "1" || headers.get("sec-gpc") === "1";
}

/**
 * Daily salt from the server secret, then a hash of address + agent.
 * The address and agent are not in the result. A new day is a new salt.
 */
export function visitorHash(ip: string, userAgent: string, day: string, secret: string): string {
  const salt = createHmac("sha256", secret).update(`visitor-day:${day}`).digest();
  return createHmac("sha256", salt).update(`${ip}\n${userAgent}`).digest("hex");
}

export function visitorSecret(env: Record<string, string | undefined> = process.env): string | null {
  const dedicated = env.VISITOR_HASH_SALT?.trim() ?? "";
  if (dedicated) return dedicated;
  const session = env.AUTH_SESSION_SECRET?.trim() ?? "";
  return session || null;
}

/** At most one hit each 2 seconds, and 30 hits in 10 minutes, per daily hash. */
export function allowVisitorHit(hash: string, now: number): boolean {
  const windowMs = 10 * 60 * 1000;
  const recent = (hits.get(hash) ?? []).filter((stamp) => now - stamp < windowMs);
  const last = recent.at(-1);
  if (recent.length >= 30 || (last !== undefined && now - last < 2000)) {
    hits.set(hash, recent);
    return false;
  }
  recent.push(now);
  hits.set(hash, recent);
  return true;
}

export function resetVisitorHitsForTests(): void {
  hits.clear();
}

export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function safeVisitPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.split("?")[0]?.split("#")[0] ?? "";
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  if (path.length > 120) return null;
  return path;
}
