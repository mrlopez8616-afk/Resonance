import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_XRPL_ACCOUNT } from "./xrpl-config";
import { buildR1Memo } from "./xrpl-memo";
import {
  XRPL_DUST_DROPS,
  assertSeedMatchesAccount,
  buildUnsignedDustPayment,
  classicAddressFromSeed,
  feeDropsFromRpc,
  signXrplPayment,
} from "./xrpl-payment";

const SECP_SEED = "snoPBrXtMeMyMHUVTgbuqAfg1SUTb";

describe("xrpl HTTP dust payment (native sign/encode)", () => {
  it("builds a 1-drop self-payment with R1 memo hex", () => {
    const memo = buildR1Memo({
      decisionId: "D-2026-09-11-04",
      hederaMessageId: "0.0.10513997/1",
      fingerprint: "ab".repeat(32),
    });
    const payment = buildUnsignedDustPayment({
      account: DEFAULT_XRPL_ACCOUNT,
      memo,
      sequence: 10,
      feeDrops: "20",
      lastLedgerSequence: 100,
    });
    assert.equal(payment.TransactionType, "Payment");
    assert.equal(payment.Account, payment.Destination);
    assert.equal(payment.Amount, XRPL_DUST_DROPS);
    assert.equal(payment.Amount, "1");
    assert.ok(!JSON.stringify(payment).includes("$"));
    assert.match(payment.Memos[0].Memo.MemoData, /^[0-9A-F]+$/);
  });

  it("signs without loading ripple-binary-codec and never leaks the seed", () => {
    const account = classicAddressFromSeed(SECP_SEED);
    const payment = buildUnsignedDustPayment({
      account,
      memo: "R1|id=D-2026-09-11-04|h=0.0.10513997/1|fp=abababababababab|net=testnet",
      sequence: 1,
      feeDrops: "20",
      lastLedgerSequence: 50,
    });
    const { txBlob } = signXrplPayment(SECP_SEED, payment);
    assert.match(txBlob, /^120000/);
    assert.ok(!txBlob.toLowerCase().includes(SECP_SEED.toLowerCase()));
  });

  it("pads fee for a memo-sized payment", () => {
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
