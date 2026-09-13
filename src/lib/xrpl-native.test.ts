import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  classicAddressFromPublicKey,
  decodeFamilySeed,
  deriveXrplKeypair,
  encodeAccountSetForSigning,
  encodeSignedAccountSet,
  signEncodedTransaction,
} from "./xrpl-native";
import { encodeMemoDataHex } from "./xrpl-memo";

const SECP_SEED = "snoPBrXtMeMyMHUVTgbuqAfg1SUTb";
const SECP_ADDRESS = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const ED_SEED = "sEdS6TLTFyELKc38NPbyJ2U4hRQbSKf";
const ED_ADDRESS = "r3SiyRc2VbEK6LUQHmE92ZFH31BfNq7YGp";

const MEMO = "R1|id=D-2026-09-11-04|h=0.0.10513997/1|fp=abababababababab|net=testnet";

const SECP_SIGNING =
  "5354580012000322000000002400000001201B0000003268400000000000001473210330E7FC9D56BB25D6893BA3F317AE5BCF33B3291BD63DB32654A313222F7FD0208114B5F762798A53D543A014CAF8B297CFF8F2F937E8F9EA7D4652317C69643D442D323032362D30392D31312D30347C683D302E302E31303531333939372F317C66703D616261626162616261626162616261627C6E65743D746573746E6574E1F1";
const SECP_BLOB =
  "12000322000000002400000001201B0000003268400000000000001473210330E7FC9D56BB25D6893BA3F317AE5BCF33B3291BD63DB32654A313222F7FD020744630440220780C93D08051D04B5319CDB6F79890FC7D0794E5089F259A2341F3D24381727D0220301D4C2CD35BDE9C52A8A813D5B6C057181AB28F1BFC99BF947C4DEE84A9C4548114B5F762798A53D543A014CAF8B297CFF8F2F937E8F9EA7D4652317C69643D442D323032362D30392D31312D30347C683D302E302E31303531333939372F317C66703D616261626162616261626162616261627C6E65743D746573746E6574E1F1";

const ED_SIGNING =
  "5354580012000322000000002400000001201B000000326840000000000000147321ED1CE3FAD53DCEB15F004C3A5347AA873CA23916EE3259D82C328E9116492163EC811451ACFEA81463F48DAED98E2EEE456ED263312A2DF9EA7D4652317C69643D442D323032362D30392D31312D30347C683D302E302E31303531333939372F317C66703D616261626162616261626162616261627C6E65743D746573746E6574E1F1";
const ED_BLOB =
  "12000322000000002400000001201B000000326840000000000000147321ED1CE3FAD53DCEB15F004C3A5347AA873CA23916EE3259D82C328E9116492163EC7440D7943A8E170475EE8F89368F47FBCC9117F53791B4FFCE122FB55B15D1775A5EEC0E5D5CD79A4ED5277DFA09B177DCEB72DF9EC7E2A8B96EFDD42AFD58B47701811451ACFEA81463F48DAED98E2EEE456ED263312A2DF9EA7D4652317C69643D442D323032362D30392D31312D30347C683D302E302E31303531333939372F317C66703D616261626162616261626162616261627C6E65743D746573746E6574E1F1";

function fixtureAccountSet(address: string, publicKey: string) {
  return {
    Account: address,
    Fee: "20",
    Sequence: 1,
    LastLedgerSequence: 50,
    Flags: 0,
    SigningPubKey: publicKey,
    Memos: [{ Memo: { MemoData: encodeMemoDataHex(MEMO) } }],
  };
}

describe("native XRPL keys (no ripple-*/@xrplf/isomorphic)", () => {
  it("decodes the documented secp256k1 family seed to the genesis address", () => {
    assert.equal(decodeFamilySeed(SECP_SEED).type, "secp256k1");
    const keypair = deriveXrplKeypair(SECP_SEED);
    assert.equal(classicAddressFromPublicKey(keypair.publicKey), SECP_ADDRESS);
    assert.match(keypair.publicKey, /^03/);
  });

  it("decodes an ed25519 family seed", () => {
    assert.equal(decodeFamilySeed(ED_SEED).type, "ed25519");
    const keypair = deriveXrplKeypair(ED_SEED);
    assert.equal(classicAddressFromPublicKey(keypair.publicKey), ED_ADDRESS);
    assert.match(keypair.publicKey, /^ED/);
  });
});

describe("no broken CJS xrpl chain on the server", () => {
  it("does not import ripple-binary-codec, ripple-keypairs, xrpl, or @xrplf/isomorphic", () => {
    const files = [
      "src/lib/xrpl-native.ts",
      "src/lib/xrpl-payment.ts",
      "src/lib/xrpl-submit.ts",
      "src/app/api/xrpl-mirror/route.ts",
    ];
    const forbidden =
      /(?:from|require\()\s*["'](?:ripple-binary-codec|ripple-keypairs|xrpl|@xrplf\/isomorphic)["']/;
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      assert.equal(forbidden.test(source), false, file);
    }
    const live = readFileSync("src/lib/xrpl-payment.ts", "utf8");
    assert.equal(/TransactionType:\s*"Payment"/.test(live), false);
    assert.equal(/Destination:\s*input\.account/.test(live), false);
  });
});

describe("native AccountSet encode + sign", () => {
  it("matches a known secp256k1 R1 memo AccountSet blob", () => {
    const keypair = deriveXrplKeypair(SECP_SEED);
    const tx = fixtureAccountSet(SECP_ADDRESS, keypair.publicKey);
    const signing = encodeAccountSetForSigning(tx);
    assert.equal(signing, SECP_SIGNING);
    const signature = signEncodedTransaction(signing, keypair);
    const blob = encodeSignedAccountSet({ ...tx, TxnSignature: signature });
    assert.equal(blob, SECP_BLOB);
    assert.match(blob, /^120003/);
    assert.ok(!blob.startsWith("120000"));
    assert.ok(!blob.includes(SECP_SEED));
  });

  it("matches a known ed25519 R1 memo AccountSet blob", () => {
    const keypair = deriveXrplKeypair(ED_SEED);
    const tx = fixtureAccountSet(ED_ADDRESS, keypair.publicKey);
    const signing = encodeAccountSetForSigning(tx);
    assert.equal(signing, ED_SIGNING);
    const signature = signEncodedTransaction(signing, keypair);
    const blob = encodeSignedAccountSet({ ...tx, TxnSignature: signature });
    assert.equal(blob, ED_BLOB);
    assert.match(blob, /^120003/);
  });
});
