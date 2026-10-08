import { verify } from "@node-rs/argon2";

export async function passwordMatches(password: string, encodedHash: string): Promise<boolean> {
  if (!password || !encodedHash) return false;
  try {
    return (await verify(encodedHash, password)) === true;
  } catch {
    return false;
  }
}
