import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertXrplSubmitAllowed,
  DEFAULT_XRPL_ACCOUNT,
  DEFAULT_XRPL_WS_URL,
  readXrplConfig,
  xrplHealth,
} from "./xrpl-config";
import { xrplExplorerUrl } from "./xrpl-explorer";

describe("xrpl env config", () => {
  it("defaults to Testnet and the public dust account when unset", () => {
    const config = readXrplConfig({});
    assert.equal(config.network, "testnet");
    assert.equal(config.account, DEFAULT_XRPL_ACCOUNT);
    assert.equal(config.seed, null);
    assert.equal(config.wsUrl, DEFAULT_XRPL_WS_URL);
    assert.equal(config.configured, false);
    assert.equal(config.rejectedNetwork, null);
  });

  it("is configured only when a server seed is present on Testnet", () => {
    const config = readXrplConfig({
      XRPL_SEED: "sEd…",
      XRPL_ACCOUNT: DEFAULT_XRPL_ACCOUNT,
    });
    assert.equal(config.configured, true);
    assert.equal(config.account, DEFAULT_XRPL_ACCOUNT);
  });

  it("rejects mainnet and health never includes a seed", () => {
    const config = readXrplConfig({
      XRPL_NETWORK: "mainnet",
      XRPL_SEED: "super-secret-family-seed-do-not-leak",
    });
    assert.equal(config.configured, false);
    assert.equal(config.rejectedNetwork, "mainnet");
    assert.throws(
      () => assertXrplSubmitAllowed(config),
      /Testnet only|rejected/i,
    );

    const health = xrplHealth({
      XRPL_SEED: "super-secret-family-seed-do-not-leak",
      XRPL_ACCOUNT: DEFAULT_XRPL_ACCOUNT,
    });
    const blob = JSON.stringify(health);
    assert.equal(health.configured, true);
    assert.equal(health.network, "testnet");
    assert.equal(health.account, DEFAULT_XRPL_ACCOUNT);
    assert.ok(!blob.includes("super-secret"));
    assert.ok(!blob.toLowerCase().includes("seed"));
    assert.ok(!("seed" in health));
    assert.ok(!("wsUrl" in health));
  });

  it("ignores a non-wss websocket override", () => {
    const config = readXrplConfig({
      XRPL_WS_URL: "http://evil.example/steal",
    });
    assert.equal(config.wsUrl, DEFAULT_XRPL_WS_URL);
  });
});

describe("xrpl explorer urls", () => {
  it("builds testnet.xrpl.org links and refuses mainnet", () => {
    const hash = "A".repeat(64);
    assert.equal(
      xrplExplorerUrl("testnet", hash),
      `https://testnet.xrpl.org/transactions/${hash}`,
    );
    assert.equal(xrplExplorerUrl("mainnet", hash), null);
    assert.equal(xrplExplorerUrl("testnet", null), null);
  });
});
