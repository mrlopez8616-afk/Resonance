import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import { ripemd160 } from "@noble/hashes/ripemd160";
import { ed25519 } from "@noble/curves/ed25519";
import { secp256k1 } from "@noble/curves/secp256k1";

/** Ripple alphabet — not Bitcoin's. */
const ALPHABET = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";
const ALPHABET_MAP = new Map([...ALPHABET].map((ch, i) => [ch, i]));

const FAMILY_SEED = 0x21;
const ED25519_SEED = [0x01, 0xe1, 0x4b];
const SIGNING_PREFIX = Uint8Array.of(0x53, 0x54, 0x58, 0x00);
const OBJECT_END = 0xe1;
const ARRAY_END = 0xf1;

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex").toUpperCase();
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error("hex payload is invalid.");
  }
  return Uint8Array.from(Buffer.from(clean, "hex"));
}

function doubleSha256(bytes: Uint8Array): Uint8Array {
  return sha256(sha256(bytes));
}

function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits = [0];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j += 1) {
      const value = digits[j] * 256 + carry;
      digits[j] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let encoded = "r".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    encoded += ALPHABET[digits[i]];
  }
  return encoded;
}

function decodeBase58(value: string): Uint8Array {
  if (!value) throw new Error("empty base58 payload.");
  let zeros = 0;
  while (zeros < value.length && value[zeros] === "r") zeros += 1;
  const bytes = [0];
  for (let i = zeros; i < value.length; i += 1) {
    const digit = ALPHABET_MAP.get(value[i]);
    if (digit === undefined) throw new Error("invalid base58 character.");
    let carry = digit;
    for (let j = 0; j < bytes.length; j += 1) {
      const valueN = bytes[j] * 58 + carry;
      bytes[j] = valueN & 0xff;
      carry = valueN >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    out[out.length - 1 - i] = bytes[i];
  }
  return out;
}

function encodeChecked(payload: Uint8Array): string {
  return encodeBase58(concatBytes(payload, doubleSha256(payload).slice(0, 4)));
}

function decodeChecked(encoded: string): Uint8Array {
  const raw = decodeBase58(encoded);
  if (raw.length < 5) throw new Error("checksum payload is too short.");
  const body = raw.slice(0, -4);
  const checksum = raw.slice(-4);
  const expected = doubleSha256(body).slice(0, 4);
  if (!expected.every((byte, i) => byte === checksum[i])) {
    throw new Error("checksum_invalid");
  }
  return body;
}

export function encodeClassicAddress(accountId: Uint8Array): string {
  if (accountId.length !== 20) throw new Error("account id must be 20 bytes.");
  return encodeChecked(concatBytes(Uint8Array.of(0), accountId));
}

export function decodeClassicAddress(address: string): Uint8Array {
  const body = decodeChecked(address);
  if (body[0] !== 0 || body.length !== 21) {
    throw new Error("classic address is invalid.");
  }
  return body.slice(1);
}

export type XrplSeedType = "ed25519" | "secp256k1";

export function decodeFamilySeed(seed: string): {
  type: XrplSeedType;
  entropy: Uint8Array;
} {
  const body = decodeChecked(seed);
  if (
    body.length === 19 &&
    body[0] === ED25519_SEED[0] &&
    body[1] === ED25519_SEED[1] &&
    body[2] === ED25519_SEED[2]
  ) {
    return { type: "ed25519", entropy: body.slice(3) };
  }
  if (body.length === 17 && body[0] === FAMILY_SEED) {
    return { type: "secp256k1", entropy: body.slice(1) };
  }
  throw new Error("XRPL family seed is not a Testnet s-address seed.");
}

function sha512Half(input: Uint8Array): Uint8Array {
  return sha512(input).slice(0, 32);
}

function deriveSecpScalar(bytes: Uint8Array, discrim?: number): bigint {
  const order = secp256k1.CURVE.n;
  const prefix = discrim === undefined ? bytes : concatBytes(bytes, u32(discrim));
  for (let i = 0; i <= 0xffffffff; i += 1) {
    const key = bytesToBigInt(sha512Half(concatBytes(prefix, u32(i))));
    if (key > BigInt(0) && key < order) return key;
  }
  throw new Error("could not derive a secp256k1 scalar.");
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value);
  return out;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = BigInt(0);
  for (const byte of bytes) value = (value << BigInt(8)) | BigInt(byte);
  return value;
}

function bigIntTo32(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, "0");
  return hexToBytes(hex);
}

export interface XrplKeypair {
  type: XrplSeedType;
  publicKey: string;
  privateKey: string;
}

export function deriveXrplKeypair(seed: string): XrplKeypair {
  const decoded = decodeFamilySeed(seed);
  if (decoded.type === "ed25519") {
    const rawPrivate = sha512Half(decoded.entropy);
    const publicKey = `ED${bytesToHex(ed25519.getPublicKey(rawPrivate))}`;
    return {
      type: "ed25519",
      publicKey,
      privateKey: `ED${bytesToHex(rawPrivate)}`,
    };
  }
  const order = secp256k1.CURVE.n;
  const privateGen = deriveSecpScalar(decoded.entropy);
  const publicGen = secp256k1.ProjectivePoint.BASE.multiply(privateGen).toRawBytes(true);
  const scalar = (deriveSecpScalar(publicGen, 0) + privateGen) % order;
  const privBytes = bigIntTo32(scalar);
  return {
    type: "secp256k1",
    publicKey: bytesToHex(secp256k1.getPublicKey(privBytes, true)),
    privateKey: `00${bytesToHex(privBytes)}`,
  };
}

export function classicAddressFromPublicKey(publicKey: string): string {
  const accountId = ripemd160(sha256(hexToBytes(publicKey)));
  return encodeClassicAddress(accountId);
}

function encodeFieldId(type: number, field: number): Uint8Array {
  if (type < 16 && field < 16) return Uint8Array.of((type << 4) | field);
  if (type < 16) return Uint8Array.of(type << 4, field);
  if (field < 16) return Uint8Array.of(field, type);
  return Uint8Array.of(0, type, field);
}

function encodeUInt16(value: number): Uint8Array {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value);
  return out;
}

function encodeUInt32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value);
  return out;
}

function encodeXrpAmount(drops: string): Uint8Array {
  if (!/^[0-9]+$/.test(drops)) throw new Error("XRP amount must be integer drops.");
  const value = BigInt(drops);
  if (value < BigInt(0) || value > BigInt("10000000000000000")) {
    throw new Error("XRP amount is out of range.");
  }
  const out = encodeUInt32(Number(value >> BigInt(32)));
  const low = encodeUInt32(Number(value & BigInt("0xffffffff")));
  const amount = concatBytes(out, low);
  amount[0] |= 0x40;
  return amount;
}

function encodeVl(bytes: Uint8Array): Uint8Array {
  if (bytes.length <= 192) return concatBytes(Uint8Array.of(bytes.length), bytes);
  throw new Error("variable-length field is too large for this encoder.");
}

/** AccountSet = 3. Never Payment (0) to self — XRPL returns temREDUNDANT. */
const TX_ACCOUNT_SET = 3;

export interface NativeAccountSet {
  Account: string;
  Fee: string;
  Sequence: number;
  LastLedgerSequence: number;
  Flags: number;
  SigningPubKey: string;
  TxnSignature?: string;
  Memos: Array<{ Memo: { MemoData: string } }>;
}

function encodeMemoArray(memos: Array<{ Memo: { MemoData: string } }>): Uint8Array {
  const chunks: Uint8Array[] = [encodeFieldId(15, 9)];
  for (const item of memos) {
    const memoData = hexToBytes(item.Memo.MemoData);
    chunks.push(
      encodeFieldId(14, 10),
      encodeFieldId(7, 13),
      encodeVl(memoData),
      Uint8Array.of(OBJECT_END),
    );
  }
  chunks.push(Uint8Array.of(ARRAY_END));
  return concatBytes(...chunks);
}

function encodeAccountSetFields(tx: NativeAccountSet, signingOnly: boolean): Uint8Array {
  const account = decodeClassicAddress(tx.Account);
  const parts: Uint8Array[] = [
    encodeFieldId(1, 2),
    encodeUInt16(TX_ACCOUNT_SET),
    encodeFieldId(2, 2),
    encodeUInt32(tx.Flags),
    encodeFieldId(2, 4),
    encodeUInt32(tx.Sequence),
    encodeFieldId(2, 27),
    encodeUInt32(tx.LastLedgerSequence),
    encodeFieldId(6, 8),
    encodeXrpAmount(tx.Fee),
    encodeFieldId(7, 3),
    encodeVl(hexToBytes(tx.SigningPubKey)),
  ];
  if (!signingOnly) {
    if (!tx.TxnSignature) throw new Error("TxnSignature is required.");
    parts.push(encodeFieldId(7, 4), encodeVl(hexToBytes(tx.TxnSignature)));
  }
  parts.push(encodeFieldId(8, 1), encodeVl(account), encodeMemoArray(tx.Memos));
  return concatBytes(...parts);
}

export function encodeAccountSetForSigning(tx: NativeAccountSet): string {
  return bytesToHex(concatBytes(SIGNING_PREFIX, encodeAccountSetFields(tx, true)));
}

export function encodeSignedAccountSet(tx: NativeAccountSet): string {
  return bytesToHex(encodeAccountSetFields(tx, false));
}

export function signEncodedTransaction(messageHex: string, keypair: XrplKeypair): string {
  const message = hexToBytes(messageHex);
  if (keypair.type === "ed25519") {
    return bytesToHex(ed25519.sign(message, hexToBytes(keypair.privateKey.slice(2))));
  }
  const priv = hexToBytes(keypair.privateKey.slice(2));
  const signature = secp256k1.sign(sha512Half(message), priv);
  return signature.toDERHex().toUpperCase();
}
