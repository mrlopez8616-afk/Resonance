import { encodeMemoDataHex } from "./xrpl-memo";
import {
  classicAddressFromPublicKey,
  deriveXrplKeypair,
  encodeAccountSetForSigning,
  encodeSignedAccountSet,
  signEncodedTransaction,
} from "./xrpl-native";

export interface XrplUnsignedAccountSet {
  TransactionType: "AccountSet";
  Account: string;
  Flags: number;
  Fee: string;
  Sequence: number;
  LastLedgerSequence: number;
  Memos: Array<{ Memo: { MemoData: string } }>;
}

export function classicAddressFromSeed(seed: string): string {
  const keypair = deriveXrplKeypair(seed);
  return classicAddressFromPublicKey(keypair.publicKey);
}

/** Fee-only AccountSet + R1 memo. Not a Payment — self-pay is temREDUNDANT. */
export function buildUnsignedMirrorAccountSet(input: {
  account: string;
  memo: string;
  sequence: number;
  feeDrops: string;
  lastLedgerSequence: number;
}): XrplUnsignedAccountSet {
  return {
    TransactionType: "AccountSet",
    Account: input.account,
    Flags: 0,
    Fee: input.feeDrops,
    Sequence: input.sequence,
    LastLedgerSequence: input.lastLedgerSequence,
    Memos: [{ Memo: { MemoData: encodeMemoDataHex(input.memo) } }],
  };
}

export function signXrplAccountSet(
  seed: string,
  tx: XrplUnsignedAccountSet,
): { txBlob: string } {
  if (tx.TransactionType !== "AccountSet") {
    throw new Error("XRPL mirror must be AccountSet. Self-Payment is temREDUNDANT.");
  }
  const keypair = deriveXrplKeypair(seed);
  const toSign = {
    Account: tx.Account,
    Fee: tx.Fee,
    Sequence: tx.Sequence,
    LastLedgerSequence: tx.LastLedgerSequence,
    Flags: tx.Flags,
    SigningPubKey: keypair.publicKey,
    Memos: tx.Memos,
  };
  const signature = signEncodedTransaction(
    encodeAccountSetForSigning(toSign),
    keypair,
  );
  return {
    txBlob: encodeSignedAccountSet({ ...toSign, TxnSignature: signature }),
  };
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
