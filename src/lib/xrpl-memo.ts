import { assertNoMoneyLeak } from "./hedera-fingerprint";

export const XRPL_MEMO_SCHEMA = "R1" as const;
export const FINGERPRINT_PREFIX_LEN = 16;

export class XrplMemoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XrplMemoError";
  }
}

const DECISION_ID_RE = /^[A-Za-z0-9._-]+$/;
const HEDERA_ID_RE = /^[A-Za-z0-9./@_-]+$/;
const FINGERPRINT_HEX_RE = /^[a-f0-9]{16,}$/;

const FORBIDDEN =
  /\b(outcome|evidence|seed|vault|xaman|secret|private[_\s-]?key)\b/i;

export function fingerprintPrefix16(fingerprint: string): string {
  const trimmed = fingerprint.trim().toLowerCase();
  if (!FINGERPRINT_HEX_RE.test(trimmed)) {
    throw new XrplMemoError(
      "fingerprint must be a hex SHA-256 (at least 16 characters).",
    );
  }
  return trimmed.slice(0, FINGERPRINT_PREFIX_LEN);
}

export function encodeMemoDataHex(memo: string): string {
  return Buffer.from(memo, "ascii").toString("hex").toUpperCase();
}

/**
 * ASCII payment-rail pointer. No amounts, outcomes, evidence, vault
 * addresses, or seeds — only a pointer back to the Hedera witness.
 *
 * `R1|id=<decisionId>|h=<hederaMessageId>|fp=<fingerprintPrefix16>|net=testnet`
 */
export function buildR1Memo(input: {
  decisionId: string;
  hederaMessageId: string;
  fingerprint: string;
  network?: string;
}): string {
  const decisionId = input.decisionId.trim();
  const hederaMessageId = input.hederaMessageId.trim();
  const network = (input.network ?? "testnet").trim().toLowerCase();

  if (network !== "testnet") {
    throw new XrplMemoError("R1 memo is XRPL Testnet only. Set net=testnet.");
  }
  if (!decisionId || !DECISION_ID_RE.test(decisionId)) {
    throw new XrplMemoError("decisionId is not a safe R1 token.");
  }
  if (!hederaMessageId || !HEDERA_ID_RE.test(hederaMessageId)) {
    throw new XrplMemoError("hederaMessageId is not a safe R1 token.");
  }

  const fp = fingerprintPrefix16(input.fingerprint);
  const memo = `${XRPL_MEMO_SCHEMA}|id=${decisionId}|h=${hederaMessageId}|fp=${fp}|net=testnet`;

  if (memo.includes("$") || FORBIDDEN.test(memo)) {
    throw new XrplMemoError(
      "R1 memo must not include amounts, outcomes, evidence, vaults, or seeds.",
    );
  }
  assertNoMoneyLeak(memo, "XRPL R1 memo");
  if (!/^[\x20-\x7E]+$/.test(memo)) {
    throw new XrplMemoError("R1 memo must be ASCII.");
  }
  return memo;
}
