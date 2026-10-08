import {
  authNow,
  clientIp,
  isLoginConfigured,
  isOwnerUsername,
} from "@/lib/auth-core";
import { passwordMatches } from "@/lib/auth-password";
import {
  clearLoginFailures,
  createSession,
  loginAllowed,
  recordLoginFailure,
} from "@/lib/auth-store";
import { totpMatches } from "@/lib/auth-totp";

export type LoginResult =
  | { ok: true; token: string }
  | { ok: false; status: 401 | 429 | 503; error: string };

const failed = { ok: false as const, status: 401 as const, error: "Wrong password or code." };
const limited = { ok: false as const, status: 429 as const, error: "Too many attempts. Try again later." };
const unconfigured = { ok: false as const, status: 401 as const, error: "Login is not configured." };

export async function authenticatePassword(input: {
  password: string;
  code: string;
  username?: string;
  ip: string;
  userAgent: string | null;
  now?: number;
}): Promise<LoginResult> {
  if (!isLoginConfigured()) return unconfigured;
  const now = input.now ?? authNow();
  const hash = process.env.AUTH_PASSWORD_HASH?.trim() ?? "";
  const secret = process.env.AUTH_TOTP_SECRET?.trim() ?? "";
  let allowed = false;
  try {
    allowed = (await loginAllowed(input.ip, now)).ok;
  } catch {
    return { ok: false, status: 503, error: "Sign-in is unavailable." };
  }
  if (!allowed) return limited;

  const passwordOk = await passwordMatches(input.password, hash);
  const codeOk = totpMatches(secret, input.code, now);
  const ownerOk = isOwnerUsername(input.username);
  if (!passwordOk || !codeOk || !ownerOk) {
    try {
      await recordLoginFailure(input.ip, now);
    } catch {
      return { ok: false, status: 503, error: "Sign-in is unavailable." };
    }
    return failed;
  }

  try {
    await clearLoginFailures(input.ip, now);
    const token = await createSession(input.userAgent, now);
    return { ok: true, token };
  } catch {
    return { ok: false, status: 503, error: "Sign-in is unavailable." };
  }
}

export function loginInputFromRequest(
  request: Request,
  body: { password?: unknown; code?: unknown; username?: unknown },
): { password: string; code: string; username: string; ip: string; userAgent: string | null } {
  return {
    password: typeof body.password === "string" ? body.password : "",
    code: typeof body.code === "string" ? body.code : "",
    username: typeof body.username === "string" ? body.username : "",
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent"),
  };
}
