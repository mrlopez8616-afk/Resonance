import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_HEDERA_OPERATOR_ID,
  hederaHealth,
  readHederaConfig,
} from "./hedera-config";

describe("hedera env config", () => {
  it("defaults to Testnet and the public operator id when unset", () => {
    const config = readHederaConfig({});
    assert.equal(config.network, "testnet");
    assert.equal(config.operatorId, DEFAULT_HEDERA_OPERATOR_ID);
    assert.equal(config.operatorKey, null);
    assert.equal(config.configured, false);
    assert.equal(config.topicId, null);
  });

  it("is configured only when a server operator key is present", () => {
    const config = readHederaConfig({
      HEDERA_OPERATOR_KEY: "302e…",
      HEDERA_TOPIC_ID: "0.0.4242",
    });
    assert.equal(config.configured, true);
    assert.equal(config.topicId, "0.0.4242");
  });

  it("prefers env topic over a persisted topic", () => {
    const config = readHederaConfig(
      { HEDERA_OPERATOR_KEY: "x", HEDERA_TOPIC_ID: "0.0.9" },
      "0.0.8",
    );
    assert.equal(config.topicId, "0.0.9");
    const persisted = readHederaConfig({ HEDERA_OPERATOR_KEY: "x" }, "0.0.8");
    assert.equal(persisted.topicId, "0.0.8");
  });

  it("rejects mainnet and health never includes a key", () => {
    const config = readHederaConfig({
      HEDERA_NETWORK: "mainnet",
      HEDERA_OPERATOR_KEY: "super-secret-key-do-not-leak",
    });
    assert.equal(config.configured, false);
    assert.equal(config.rejectedNetwork, "mainnet");
    const health = hederaHealth({
      HEDERA_OPERATOR_KEY: "super-secret-key-do-not-leak",
      HEDERA_OPERATOR_ID: DEFAULT_HEDERA_OPERATOR_ID,
    });
    const blob = JSON.stringify(health);
    assert.equal(health.configured, true);
    assert.equal(health.network, "testnet");
    assert.equal(health.operatorId, DEFAULT_HEDERA_OPERATOR_ID);
    assert.ok(!blob.includes("super-secret"));
    assert.ok(!blob.toLowerCase().includes("key"));
    assert.ok(!("operatorKey" in health));
  });
});
