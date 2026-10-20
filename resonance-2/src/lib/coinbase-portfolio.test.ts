import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { describe, it } from "node:test";
import { SUI_SLEEVES } from "@/data/sui-sleeves";
import { XRP_SLEEVES } from "@/data/xrp-sleeves";
import { holdingChildModel } from "@/lib/child-card";
import {
  applySuiCoinbaseQuantities,
  buildCoinbaseJwt,
  overlaySuiBook,
  parseCoinbaseJson,
  parsePortfolioList,
  readCoinbaseCredentials,
  resolveSuiCoinbaseBalance,
  suiQuantityFromBreakdown,
  suiSleeveQuantities,
  type CoinbasePortfolioRef,
} from "@/lib/coinbase-portfolio";
import { assembleLiveFace } from "@/lib/live-face";
import { parentAggregate } from "@/lib/node-parents";
import { hasMoneyText, publicPayloadLeaks, toPublicFloor } from "@/lib/public-mode";
import { suiBalanceLine } from "@/lib/sui-balance-line";
import { valueCardFromFace } from "@/lib/value-card";

const DEFAULT_ID = "11111111-1111-4111-8111-111111111111";
const AGENTIC_ID = "22222222-2222-4222-8222-222222222222";
const AS_OF = "2026-10-20T16:32:00.000Z";
const QUOTE = { usd: 2, source: "test", fetchedAt: "2026-10-20T16:32:00.000Z" };

const DEFAULT_BREAKDOWN = `{
  "breakdown": {
    "portfolio": { "name": "Default", "type": "DEFAULT", "uuid": "${DEFAULT_ID}" },
    "spot_positions": [
      { "asset": "XRP", "account_type": "ACCOUNT_TYPE_WALLET", "total_balance_crypto": 280.48495 },
      { "asset": "SUI", "account_type": "ACCOUNT_TYPE_STAKED_FUNDS", "total_balance_crypto": 49.050865 },
      { "asset": "SUI", "account_type": "ACCOUNT_TYPE_WALLET", "total_balance_crypto": 1.2 }
    ]
  }
}`;

const AGENTIC_BREAKDOWN = `{
  "breakdown": {
    "portfolio": { "name": "Agentic", "type": "CONSUMER", "uuid": "${AGENTIC_ID}" },
    "spot_positions": [
      { "asset": "XRP", "account_type": "ACCOUNT_TYPE_WALLET", "total_balance_crypto": 9 }
    ]
  }
}`;

function portfolios(): CoinbasePortfolioRef[] {
  return [
    { uuid: DEFAULT_ID, name: "Default", type: "DEFAULT" },
    { uuid: AGENTIC_ID, name: "Agentic", type: "CONSUMER" },
  ];
}

function decoded(token: string): { header: Record<string, unknown>; payload: Record<string, unknown>; signing: string; signature: Buffer } {
  const [header, payload, signature] = token.split(".");
  assert.equal(token.split(".").length, 3);
  return {
    header: JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as Record<string, unknown>,
    payload: JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>,
    signing: `${header}.${payload}`,
    signature: Buffer.from(signature, "base64url"),
  };
}

describe("coinbase portfolio breakdown", () => {
  it("sums staked and liquid SUI and leaves every other asset out", () => {
    const parsed = parseCoinbaseJson(DEFAULT_BREAKDOWN);
    assert.equal(suiQuantityFromBreakdown(parsed), "50.250865");
    assert.equal(suiQuantityFromBreakdown(parseCoinbaseJson(AGENTIC_BREAKDOWN)), "0");
    const quantities = suiSleeveQuantities(
      portfolios(),
      new Map([
        [DEFAULT_ID, parsed],
        [AGENTIC_ID, parseCoinbaseJson(AGENTIC_BREAKDOWN)],
      ]),
    );
    assert.deepEqual(quantities, { coinbase: "50.250865", cbAgentic: "0" });
  });

  it("keeps a staked-only print and refuses an unreadable SUI row", () => {
    const stakedOnly = parseCoinbaseJson(
      DEFAULT_BREAKDOWN.replace(
        '{ "asset": "SUI", "account_type": "ACCOUNT_TYPE_WALLET", "total_balance_crypto": 1.2 }',
        '{ "asset": "USD", "account_type": "ACCOUNT_TYPE_FIAT", "is_cash": true }',
      ),
    );
    assert.equal(suiQuantityFromBreakdown(stakedOnly), "49.050865");
    assert.equal(
      suiQuantityFromBreakdown({
        breakdown: { spot_positions: [{ asset: "SUI", total_balance_crypto: null }] },
      }),
      null,
    );
    assert.equal(suiSleeveQuantities([{ uuid: AGENTIC_ID, name: "Agentic", type: "CONSUMER" }], new Map()), null);
  });

  it("skips a deleted portfolio and still reads the default", () => {
    const listed = parsePortfolioList({
      portfolios: [
        { name: "Gone", uuid: "33333333-3333-4333-8333-333333333333", type: "DEFAULT", deleted: true },
        { name: "Default", uuid: DEFAULT_ID, type: "DEFAULT" },
      ],
    });
    assert.deepEqual(listed, [{ uuid: DEFAULT_ID, name: "Default", type: "DEFAULT" }]);
  });

  it("replaces the Coinbase sleeves and leaves RH Agentic, the vault, and XRP", () => {
    const next = applySuiCoinbaseQuantities(SUI_SLEEVES, { coinbase: "49.050865", cbAgentic: "0" });
    assert.equal(next.find((row) => row.id === "coinbase")?.quantity, "49.050865");
    assert.equal(next.find((row) => row.id === "cb-agentic")?.quantity, "0");
    assert.equal(next.find((row) => row.id === "rh-agentic")?.quantity, "0");
    const withMain = applySuiCoinbaseQuantities(
      [...SUI_SLEEVES, { id: "rh-main", label: "RH Main", quantity: "8", source: "robinhood-config" as const, manual: false }],
      { coinbase: "49.050865", cbAgentic: "0" },
    );
    assert.equal(withMain.find((row) => row.id === "rh-main")?.quantity, "8");
    const books = overlaySuiBook(
      { XRP: XRP_SLEEVES, SUI: SUI_SLEEVES },
      { coinbase: "49.050865", cbAgentic: "0" },
    );
    assert.equal(books.XRP, XRP_SLEEVES);
    assert.equal(books.XRP.find((row) => row.id === "flare-vault")?.quantity, "28287");
    assert.equal(books.XRP.find((row) => row.id === "cb-agentic")?.quantity, "10");
  });

  it("prices the live quantity on the value card and in the crypto sum", () => {
    const sleeves = applySuiCoinbaseQuantities(SUI_SLEEVES, { coinbase: "49.050865", cbAgentic: "0" });
    const face = assembleLiveFace("SUI", sleeves, QUOTE);
    const card = valueCardFromFace(face);
    assert.equal(face.totalUsd, 49.050865 * 2);
    assert.equal(card.headline, "~$98.10");
    assert.equal(card.priceLine, "$2.000 live");
    assert.equal(card.label, null);
    const xrp = assembleLiveFace("XRP", XRP_SLEEVES, QUOTE);
    const sum = parentAggregate(
      "crypto",
      [],
      { XRP: xrp.totalUsd, SUI: face.totalUsd },
      null,
      "live",
    );
    assert.equal(sum.valuedCount, sum.paintedCount);
    assert.equal(sum.liveUsd, (xrp.totalUsd ?? 0) + (face.totalUsd ?? 0));
    const model = holdingChildModel({
      face,
      now: new Date(AS_OF),
      statusLine: suiBalanceLine({ fresh: false, asOf: AS_OF }),
    });
    assert.equal(model.headline, "~$98.10");
    assert.equal(model.lines.some((line) => line.text === "stale · as of Oct 20, 11:32 AM"), true);
    assert.equal(model.lines.some((line) => hasMoneyText(line.text)), false);
    assert.equal(suiBalanceLine({ fresh: true, asOf: AS_OF }), null);
    assert.equal(suiBalanceLine({ fresh: false, asOf: null }), "stale");
  });

  it("keeps public mode on percents", () => {
    const model = toPublicFloor([
      {
        ticker: "SUI",
        value: 49.050865 * 2,
        firstBuyPrice: 0.8,
        livePrice: 2,
        daily: [
          { day: "2026-10-19", value: 90, buy: false },
          { day: "2026-10-20", value: 98.1, buy: false },
        ],
      },
      {
        ticker: "NVDA",
        value: 100,
        firstBuyPrice: 10,
        livePrice: 12,
        daily: [
          { day: "2026-10-19", value: 90, buy: false },
          { day: "2026-10-20", value: 100, buy: false },
        ],
      },
    ]);
    const sui = model.crypto.holdings.find((holding) => holding.ticker === "SUI");
    assert.match(sui?.weightLabel ?? "", /%$/);
    assert.match(sui?.gainLabel ?? "", /%$/);
    assert.equal(JSON.stringify(model).includes("$"), false);
    assert.deepEqual(publicPayloadLeaks(model), []);
  });
});

describe("coinbase credentials", () => {
  it("reads the server env names and ignores a blank secret", () => {
    assert.equal(readCoinbaseCredentials({}), null);
    assert.equal(readCoinbaseCredentials({ COINBASE_API_KEY_NAME: " organizations/o/apiKeys/k " }), null);
    assert.deepEqual(
      readCoinbaseCredentials({
        COINBASE_API_KEY_NAME: " organizations/o/apiKeys/k ",
        COINBASE_API_KEY_SECRET: "secret",
      }),
      { keyName: "organizations/o/apiKeys/k", keySecret: "secret" },
    );
  });

  it("signs an ES256 JWT whose claims name the portfolio path and not the secret", () => {
    const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const secret = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const keyName = "organizations/o/apiKeys/k";
    const token = buildCoinbaseJwt({
      keyName,
      keySecret: secret.replace(/\n/g, "\\n"),
      method: "GET",
      path: `/api/v3/brokerage/portfolios/${DEFAULT_ID}`,
      nowSeconds: 1_700_000_000,
    });
    assert.ok(token);
    assert.equal(token.includes(secret), false);
    assert.equal(token.includes("BEGIN"), false);
    const parts = decoded(token);
    assert.equal(parts.header.alg, "ES256");
    assert.equal(parts.header.kid, keyName);
    assert.equal(parts.payload.iss, "cdp");
    assert.equal(parts.payload.sub, keyName);
    assert.equal(
      parts.payload.uri,
      `GET api.coinbase.com/api/v3/brokerage/portfolios/${DEFAULT_ID}`,
    );
    assert.equal(
      verify(
        "sha256",
        Buffer.from(parts.signing),
        { key: pair.publicKey, dsaEncoding: "ieee-p1363" },
        parts.signature,
      ),
      true,
    );
  });

  it("signs an Ed25519 secret the same way", () => {
    const pair = generateKeyPairSync("ed25519");
    const der = pair.privateKey.export({ type: "pkcs8", format: "der" }) as Buffer;
    const seed = der.subarray(der.length - 32);
    const pub = pair.publicKey.export({ type: "spki", format: "der" }) as Buffer;
    const secret = Buffer.concat([seed, pub.subarray(pub.length - 32)]).toString("base64");
    const token = buildCoinbaseJwt({
      keyName: "organizations/o/apiKeys/ed",
      keySecret: secret,
      method: "get",
      path: "/api/v3/brokerage/portfolios",
      nowSeconds: 1_700_000_000,
    });
    assert.ok(token);
    assert.equal(token.includes(secret), false);
    const parts = decoded(token);
    assert.equal(parts.header.alg, "EdDSA");
    assert.deepEqual(parts.payload.aud, ["cdp_service"]);
    assert.equal(parts.payload.uri, "GET api.coinbase.com/api/v3/brokerage/portfolios");
    assert.equal(verify(null, Buffer.from(parts.signing), pair.publicKey, parts.signature), true);
    assert.equal(buildCoinbaseJwt({ keyName: "k", keySecret: "not-a-key", method: "GET", path: "/api/v3/brokerage/portfolios" }), null);
  });
});

function signingSecret(): string {
  return generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({
    type: "pkcs8",
    format: "pem",
  }).toString();
}

describe("sui balance fallback", () => {
  const credentials = { keyName: "organizations/o/apiKeys/k", keySecret: signingSecret() };

  it("does not call Coinbase when the key is missing and keeps the sleeve print", async () => {
    let called = false;
    const result = await resolveSuiCoinbaseBalance({
      fallback: { coinbase: "33.7", cbAgentic: "0" },
      credentials: null,
      now: new Date(AS_OF),
      fetchImpl: async () => {
        called = true;
        return new Response("no");
      },
      stored: null,
      save: async () => {
        throw new Error("should not store a print");
      },
    });
    assert.equal(called, false);
    assert.deepEqual(result, {
      quantities: { coinbase: "33.7", cbAgentic: "0" },
      fresh: false,
      asOf: null,
    });
  });

  it("stores a live staked balance and uses that row when the next read fails", async () => {
    const saved: { coinbase: string; cbAgentic: string; asOf: string }[] = [];
    const live = await resolveSuiCoinbaseBalance({
      fallback: { coinbase: "33.7", cbAgentic: "0" },
      credentials,
      now: new Date(AS_OF),
      fetchImpl: async (url) => {
        const path = String(url);
        if (path.endsWith("/api/v3/brokerage/portfolios")) {
          return Response.json({
            portfolios: [
              { name: "Default", type: "DEFAULT", uuid: DEFAULT_ID },
              { name: "Agentic", type: "CONSUMER", uuid: AGENTIC_ID },
            ],
          });
        }
        if (path.endsWith(DEFAULT_ID)) return new Response(DEFAULT_BREAKDOWN);
        if (path.endsWith(AGENTIC_ID)) return new Response(AGENTIC_BREAKDOWN);
        return new Response("missing", { status: 404 });
      },
      stored: null,
      save: async (row) => {
        saved.push(row);
      },
    });
    assert.deepEqual(live.quantities, { coinbase: "50.250865", cbAgentic: "0" });
    assert.equal(live.fresh, true);
    assert.equal(live.asOf, AS_OF);
    assert.equal(saved.length, 1);

    const stale = await resolveSuiCoinbaseBalance({
      fallback: { coinbase: "33.7", cbAgentic: "0" },
      credentials,
      now: new Date("2026-10-20T18:00:00.000Z"),
      fetchImpl: async () => new Response("down", { status: 503 }),
      stored: saved[0] ?? null,
      save: async () => {
        throw new Error("should not overwrite a failed read");
      },
    });
    assert.deepEqual(stale, {
      quantities: { coinbase: "50.250865", cbAgentic: "0" },
      fresh: false,
      asOf: AS_OF,
    });
  });

  it("keeps the live quantity when the store write fails and never invents a zero", async () => {
    const live = await resolveSuiCoinbaseBalance({
      fallback: { coinbase: null, cbAgentic: null },
      credentials,
      now: new Date(AS_OF),
      fetchImpl: async (url) => {
        if (String(url).endsWith(DEFAULT_ID)) return new Response(DEFAULT_BREAKDOWN);
        if (String(url).endsWith("/portfolios")) {
          return Response.json({ portfolios: [{ name: "Default", type: "DEFAULT", uuid: DEFAULT_ID }] });
        }
        return new Response("no", { status: 404 });
      },
      stored: null,
      save: async () => {
        throw new Error("db down");
      },
    });
    assert.equal(live.fresh, true);
    assert.deepEqual(live.quantities, { coinbase: "50.250865", cbAgentic: "0" });

    const empty = await resolveSuiCoinbaseBalance({
      fallback: { coinbase: null, cbAgentic: "nope" },
      credentials: null,
      now: new Date(AS_OF),
      fetchImpl: async () => new Response("no"),
      stored: null,
      save: async () => undefined,
    });
    assert.equal(empty.quantities, null);
    assert.equal(empty.fresh, false);
  });
});
