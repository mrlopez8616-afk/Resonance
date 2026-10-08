import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
  PASSKEY_COOKIE,
  authNow,
  base64UrlToBytes,
  bytesToBase64Url,
  clientIp,
  deviceLabel,
  getSessionSecret,
  isLoginConfigured,
  openChallenge,
  passkeyUserId,
  readCookieValue,
  sealChallenge,
  webauthnConfig,
} from "@/lib/auth-core";
import {
  clearLoginFailures,
  createSession,
  deletePasskey,
  getPasskey,
  insertPasskey,
  listPasskeys,
  loginAllowed,
  recordLoginFailure,
  touchPasskey,
} from "@/lib/auth-store";

const limited = { ok: false as const, status: 429 as const, error: "Too many attempts. Try again later." };
const rejected = { ok: false as const, status: 401 as const, error: "Passkey was not accepted." };

function configured() {
  return webauthnConfig();
}

export async function beginRegistration(userAgent: string | null, now = authNow()) {
  const rp = configured();
  if (!rp || !isLoginConfigured()) {
    return { ok: false as const, status: 503 as const, error: "Passkeys are not configured." };
  }
  const existing = await listPasskeys();
  const options = await generateRegistrationOptions({
    rpName: "Resonance",
    rpID: rp.rpID,
    userName: "andres",
    userDisplayName: "Andres",
    userID: passkeyUserId(),
    attestationType: "none",
    excludeCredentials: existing.map((row) => ({
      id: row.credentialId,
      transports: row.transports,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });
  return {
    ok: true as const,
    options,
    sealed: sealChallenge({ challenge: options.challenge, kind: "register" }, getSessionSecret(), now),
  };
}

export async function finishRegistration(input: {
  response: RegistrationResponseJSON;
  sealed: string | null;
  userAgent: string | null;
  now?: number;
}) {
  const rp = configured();
  if (!rp || !isLoginConfigured()) {
    return { ok: false as const, status: 503 as const, error: "Passkeys are not configured." };
  }
  const now = input.now ?? authNow();
  const challenge = openChallenge(input.sealed, getSessionSecret(), now);
  if (!challenge || challenge.kind !== "register") return rejected;
  let verified;
  try {
    verified = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
    });
  } catch {
    return rejected;
  }
  if (!verified.verified) return rejected;
  const credential = verified.registrationInfo.credential;
  await insertPasskey({
    credentialId: credential.id,
    publicKey: bytesToBase64Url(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
    deviceLabel: deviceLabel(input.userAgent),
    now,
  });
  return { ok: true as const };
}

export async function beginAuthentication(now = authNow()) {
  const rp = configured();
  if (!rp || !isLoginConfigured()) {
    return { ok: false as const, status: 503 as const, error: "Passkeys are not configured." };
  }
  const existing = await listPasskeys();
  if (existing.length === 0) {
    return { ok: false as const, status: 400 as const, error: "No passkey is registered." };
  }
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    allowCredentials: existing.map((row) => ({
      id: row.credentialId,
      transports: row.transports,
    })),
    userVerification: "preferred",
  });
  return {
    ok: true as const,
    options,
    sealed: sealChallenge(
      { challenge: options.challenge, kind: "authenticate" },
      getSessionSecret(),
      now,
    ),
  };
}

export async function finishAuthentication(input: {
  response: AuthenticationResponseJSON;
  sealed: string | null;
  ip: string;
  userAgent: string | null;
  now?: number;
}) {
  const rp = configured();
  if (!rp || !isLoginConfigured()) {
    return { ok: false as const, status: 401 as const, error: "Login is not configured." };
  }
  const now = input.now ?? authNow();
  if (!(await loginAllowed(input.ip, now)).ok) return limited;
  const challenge = openChallenge(input.sealed, getSessionSecret(), now);
  const credentialId = input.response?.id;
  const stored = typeof credentialId === "string" ? await getPasskey(credentialId) : null;
  if (!challenge || challenge.kind !== "authenticate" || !stored) {
    await recordLoginFailure(input.ip, now);
    return rejected;
  }
  let verified;
  try {
    verified = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: {
        id: stored.credentialId,
        publicKey: base64UrlToBytes(stored.publicKey),
        counter: stored.counter,
        transports: stored.transports,
      },
      requireUserVerification: true,
    });
  } catch {
    await recordLoginFailure(input.ip, now);
    return rejected;
  }
  if (!verified.verified) {
    await recordLoginFailure(input.ip, now);
    return rejected;
  }
  await touchPasskey(stored.credentialId, verified.authenticationInfo.newCounter, now);
  await clearLoginFailures(input.ip, now);
  const token = await createSession(input.userAgent, now);
  return { ok: true as const, token };
}

export async function removePasskey(credentialId: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(credentialId)) return false;
  const existing = await getPasskey(credentialId);
  if (!existing) return false;
  await deletePasskey(credentialId);
  return true;
}

export function passkeyCookie(request: Request): string | null {
  return readCookieValue(request.headers.get("cookie"), PASSKEY_COOKIE);
}

export function requestIp(request: Request): string {
  return clientIp(request);
}
