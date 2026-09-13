import { encode, encodeForSigning } from "ripple-binary-codec";
import { deriveAddress, deriveKeypair, sign } from "ripple-keypairs";
import { encodeMemoDataHex } from "./xrpl-memo";

/** One drop. Recorder self-payment — not a transfer and not a dollar size. */
export const XRPL_DUST_DROPS = "1";

export interface XrplUnsignedPayment {
  TransactionType: "Payment";
  Account: string;
  Destination: string;
  Amount: string;
  Flags: number;
  Fee: string;
  Sequence: number;
  LastLedgerSequence: number;
  Memos: Array<{ Memo: { MemoData: string } }>;
}

export function classicAddressFromSeed(seed: string): string {
  const { publicKey } = deriveKeypair(seed);
  return deriveAddress(publicKey);
}

export function buildUnsignedDustPayment(input: {
  account: string;
  memo: string;
  sequence: number;
  feeDrops: string;
  lastLedgerSequence: number;
}): XrplUnsignedPayment {
  return {
    TransactionType: "Payment",
    Account: input.account,
    Destination: input.account,
    Amount: XRPL_DUST_DROPS,
    Flags: 0,
    Fee: input.feeDrops,
    Sequence: input.sequence,
    LastLedgerSequence: input.lastLedgerSequence,
    Memos: [{ Memo: { MemoData: encodeMemoDataHex(input.memo) } }],
  };
}

export function signXrplPayment(
  seed: string,
  payment: XrplUnsignedPayment,
): { txBlob: string } {
  const keypair = deriveKeypair(seed);
  const toSign = {
    ...payment,
    SigningPubKey: keypair.publicKey,
  };
  const signed = {
    ...toSign,
    TxnSignature: sign(encodeForSigning(toSign), keypair.privateKey),
  };
  return { txBlob: encode(signed) };
}

export function feeDropsFromRpc(result: Record<string, unknown>): string {
  const minFee = 12;
  const drops =
    result.drops && typeof result.drops === "object"
      ? (result.drops as Record<string, unknown>)
      : {};
  const open = Number(drops.open_ledger_fee ?? drops.base_fee ?? minFee);
  const safe = Number.isFinite(open) ? open : minFee;
  return String(Math.max(minFee, Math.ceil(safe * 2)));
}

export function assertSeedMatchesAccount(seed: string, account: string): string {
  let address: string;
  try {
    address = classicAddressFromSeed(seed);
  } catch {
    throw new Error(
      "XRPL_SEED could not be parsed. Use the Testnet family seed for the dust wallet. Never a Xaman principal seed.",
    );
  }
  if (address !== account) {
    throw new Error(
      "XRPL_SEED does not match XRPL_ACCOUNT. Use the Testnet dust wallet for the documented classic address — never the Xaman principal.",
    );
  }
  return address;
}
