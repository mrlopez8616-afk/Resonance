import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_XRPL_ACCOUNT } from "./xrpl-config";
import { buildR1Memo } from "./xrpl-memo";
import {
  assertSeedMatchesAccount,
  buildUnsignedMirrorAccountSet,
  classicAddressFromSeed,
  feeDropsFromRpc,
  signXrplAccountSet,
} from "./xrpl-payment";

const SECP_SEED = "snoPBrXtMeMyMHUVTgbuqAfg1SUTb";

describe("xrpl HTTP AccountSet mirror (native sign/encode)", () => {
  it("builds a fee-only AccountSet with R1 memo hex and no Destination", () => {
    const memo = buildR1Memo({
      decisionId: "D-2026-09-11-04",
      hederaMessageId: "0.0.10513997/1",
      fingerprint: "ab".repeat(32),
    });
    const tx = buildUnsignedMirrorAccountSet({
      account: DEFAULT_XRPL_ACCOUNT,
      memo,
      sequence: 10,
      feeDrops: "20",
      lastLedgerSequence: 100,
    });
    assert.equal(tx.TransactionType, "AccountSet");
    assert.equal(tx.Account, DEFAULT_XRPL_ACCOUNT);
    assert.equal("Destination" in tx, false);
    assert.equal("Amount" in tx, false);
    assert.ok(!JSON.stringify(tx).includes("$"));
    assert.match(tx.Memos[0].Memo.MemoData, /^[0-9A-F]+$/);
  });

  it("signs an AccountSet blob (not Payment 0x120000) and never leaks the seed", () => {
    const account = classicAddressFromSeed(SECP_SEED);
    const tx = buildUnsignedMirrorAccountSet({
      account,
      memo: "R1|id=D-2026-09-11-04|h=0.0.10513997/1|fp=abababababababab|net=testnet",
      sequence: 1,
      feeDrops: "20",
      lastLedgerSequence: 50,
    });
    const { txBlob } = signXrplAccountSet(SECP_SEED, tx);
    assert.match(txBlob, /^120003/);
    assert.ok(!txBlob.startsWith("120000"));
    assert.ok(!txBlob.toLowerCase().includes(SECP_SEED.toLowerCase()));
  });

  it("pads fee for a memo-sized AccountSet", () => {
    assert.equal(
      feeDropsFromRpc({ drops: { base_fee: "10", open_ledger_fee: "10" } }),
      "20",
    );
    assert.equal(feeDropsFromRpc({}), "24");
  });

  it("rejects a seed/account mismatch without echoing the seed", () => {
    assert.throws(
      () => assertSeedMatchesAccount(SECP_SEED, DEFAULT_XRPL_ACCOUNT),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /does not match XRPL_ACCOUNT/);
        assert.ok(!error.message.includes(SECP_SEED));
        return true;
      },
    );
  });
});
