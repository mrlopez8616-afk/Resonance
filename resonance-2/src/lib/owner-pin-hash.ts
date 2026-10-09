import "server-only";

import { hash, verify } from "@node-rs/argon2";
import { isPinShape } from "@/lib/owner-pin";

/** Defaults are argon2id, m=19456, t=2, p=1. Same cost as the sign-in password. */
const OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Argon2id PHC string. The PIN is not written anywhere else. */
export async function hashOwnerPin(pin: string): Promise<string> {
  if (!isPinShape(pin)) throw new Error("PIN must be 4 to 6 digits.");
  return hash(pin, OPTIONS);
}

export async function ownerPinMatches(pin: string, encodedHash: string): Promise<boolean> {
  if (!isPinShape(pin) || !encodedHash.startsWith("$argon2id$")) return false;
  try {
    return (await verify(encodedHash, pin)) === true;
  } catch {
    return false;
  }
}
