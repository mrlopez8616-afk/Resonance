import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { EnvLike } from "@/lib/sync-auth-core";

const KEY_HEX = /^[0-9a-fA-F]{64}$/;

export type EncryptedFinancePayload = {
  payloadEnc: string;
  iv: string;
  tag: string;
};

export function financeKeyFromEnv(env: EnvLike = process.env): Buffer | null {
  const raw = env.FINANCE_ENC_KEY?.trim() ?? "";
  if (!KEY_HEX.test(raw)) return null;
  return Buffer.from(raw, "hex");
}

export function snapshotSha256(canonical: string): string {
  return createHash("sha256").update(canonical).digest("hex");
}

function aad(asOf: string): Buffer {
  return Buffer.from(`finance:v1:${asOf}`);
}

export function encryptFinancePayload(
  plaintext: string,
  key: Buffer,
  asOf: string,
): EncryptedFinancePayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(asOf));
  const payload = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    payloadEnc: payload.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptFinancePayload(
  encrypted: EncryptedFinancePayload,
  key: Buffer,
  asOf: string,
): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "base64"));
  decipher.setAAD(aad(asOf));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(encrypted.payloadEnc, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}
